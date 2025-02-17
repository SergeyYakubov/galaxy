"""
Shared model and mapping code between Galaxy and Tool Shed, trying to
generalize to generic database connections.
"""
import contextlib
import os
import threading
from contextvars import ContextVar
from inspect import (
    getmembers,
    isclass,
)
from typing import (
    Dict,
    Type,
    TYPE_CHECKING,
    Union,
)

from sqlalchemy import event
from sqlalchemy.orm import (
    scoped_session,
    Session,
    sessionmaker,
)

from galaxy.util.bunch import Bunch

if TYPE_CHECKING:
    from galaxy.model.store import SessionlessContext

# Create a ContextVar with mutable state, this allows sync tasks in the context
# of a request (which run within a threadpool) to see changes to the ContextVar
# state. See https://github.com/tiangolo/fastapi/issues/953#issuecomment-586006249
# for details
_request_state: Dict[str, str] = {}
REQUEST_ID = ContextVar("request_id", default=_request_state.copy())


@contextlib.contextmanager
def transaction(session: Union[scoped_session, Session, "SessionlessContext"]):
    """Start a new transaction only if one is not present."""
    # temporary hack; need to fix access to scoped_session callable, not proxy
    if isinstance(session, scoped_session):
        session = session()
    # hack: this could be model.store.SessionlessContext; then we don't need to do anything
    elif not isinstance(session, Session):
        yield
        return  # exit: can't use as a Session

    if not session.in_transaction():
        with session.begin():
            yield
    else:
        yield


# TODO: Refactor this to be a proper class, not a bunch.
class ModelMapping(Bunch):
    def __init__(self, model_modules, engine):
        self.engine = engine
        self._SessionLocal = sessionmaker(autoflush=False, autocommit=False)
        versioned_session(self._SessionLocal)
        context = scoped_session(self._SessionLocal, scopefunc=self.request_scopefunc)
        # For backward compatibility with "context.current"
        # deprecated?
        context.current = context
        self.session = context
        self.scoped_registry = context.registry

        model_classes = {}
        for module in model_modules:
            m_obs = getmembers(module, isclass)
            m_obs = dict([m for m in m_obs if m[1].__module__ == module.__name__])
            model_classes.update(m_obs)

        super().__init__(**model_classes)

        context.remove()
        context.configure(bind=engine)

    def new_session(self):
        """
        Return a new non-scoped Session object.

        Use this when we need to operate on ORM entities, so a Connection object would be
        insufficient; yet the operation must be independent of the main session (self.session).
        """
        return self._SessionLocal()

    def request_scopefunc(self):
        """
        Return a value that is used as dictionary key for sqlalchemy's ScopedRegistry.

        This ensures that threads or request contexts will receive a single identical session
        from the ScopedRegistry.
        """
        return REQUEST_ID.get().get("request") or threading.get_ident()

    @staticmethod
    def set_request_id(request_id):
        # Set REQUEST_ID to a new dict.
        # This new ContextVar value will only be seen by the current asyncio context
        # and descendant threadpools, but not other threads or asyncio contexts.
        return REQUEST_ID.set({"request": request_id})

    def unset_request_id(self, request_id):
        # Unconditionally calling self.gx_app.model.session.remove()
        # would create a new session if the session was not accessed
        # in a request, so we check if there is a sqlalchemy session
        # for the current request in the registry.
        if request_id in self.scoped_registry.registry:
            self.scoped_registry.registry[request_id].close()
            del self.scoped_registry.registry[request_id]

    @property
    def context(self) -> scoped_session:
        return self.session

    @property
    def Session(self):
        """
        For backward compat., deprecated.
        """
        return self.context


class SharedModelMapping(ModelMapping):
    """Model mapping containing references to classes shared between Galaxy and ToolShed.

    Generally things can be more strongly typed when importing models directly, but we need
    a way to do app.model.<CLASS> for common code shared by the tool shed and Galaxy.
    """

    User: Type
    GalaxySession: Type
    APIKeys: Type
    PasswordResetToken: Type


def versioned_objects(iter):
    for obj in iter:
        if hasattr(obj, "__create_version__"):
            yield obj


def versioned_objects_strict(iter):
    for obj in iter:
        if hasattr(obj, "__create_version__"):
            if obj.extension != "len":
                # TODO: Custom builds (with .len extension) do not get a history or a HID.
                # These should get some other type of permanent storage, perhaps UserDatasetAssociation ?
                # Everything else needs to have a hid and a history
                if not obj.history and not obj.history_id:
                    raise Exception(f"HistoryDatasetAssociation {obj} without history detected, this is not valid")
                elif not obj.hid:
                    raise Exception(f"HistoryDatasetAssociation {obj} without hid, this is not valid")
                elif obj.dataset.file_size is None and obj.dataset.state not in obj.dataset.no_data_states:
                    raise Exception(
                        f"HistoryDatasetAssociation {obj} in state {obj.dataset.state} with null file size, this is not valid"
                    )
            yield obj


if os.environ.get("GALAXY_TEST_RAISE_EXCEPTION_ON_HISTORYLESS_HDA"):
    versioned_objects = versioned_objects_strict  # noqa: F811


def versioned_session(session):
    @event.listens_for(session, "before_flush")
    def before_flush(session, flush_context, instances):
        for obj in versioned_objects(session.dirty):
            obj.__create_version__(session)
        for obj in versioned_objects(session.deleted):
            obj.__create_version__(session, deleted=True)
