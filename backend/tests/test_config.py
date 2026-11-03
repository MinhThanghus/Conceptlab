import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_requires_secure_cookies():
    with pytest.raises(ValidationError, match="COOKIE_SECURE must be true"):
        Settings(_env_file=None, app_env="production", cookie_secure=False)
    assert Settings(_env_file=None, app_env="production", cookie_secure=True).cookie_secure
    assert not Settings(_env_file=None, app_env="development", cookie_secure=False).cookie_secure
