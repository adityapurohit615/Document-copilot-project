from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """The base class for all database models.
    All table models subclass Base so Alembic can track them.
    """
    pass