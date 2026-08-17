"""
Database configuration.

Uses SQLite locally so the demo runs with zero setup. Every model below is
written in plain SQLAlchemy (lat/lng as floats, not PostGIS geometry types)
specifically so the swap to the production target — PostgreSQL + PostGIS,
per Section 5 of the project document — only requires changing DATABASE_URL
and adding a GeoAlchemy2 Geometry column where noted in models.py.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./prahari.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
