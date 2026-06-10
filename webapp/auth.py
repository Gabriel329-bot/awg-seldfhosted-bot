import hashlib
import hmac
import json
import time
from typing import Any
from urllib.parse import parse_qsl


class WebAppAuthError(RuntimeError):
    pass


def verify_telegram_init_data(
    init_data: str,
    bot_token: str,
    max_age_seconds: int = 86400,
) -> dict[str, Any]:
    if not init_data:
        raise WebAppAuthError("Missing init data")

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", "")
    if not received_hash:
        raise WebAppAuthError("Missing hash")

    data_check_string = "\n".join(f"{key}={values[key]}" for key in sorted(values))

    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise WebAppAuthError("Invalid hash")

    try:
        auth_date = int(values.get("auth_date", "0") or "0")
    except ValueError as exc:
        raise WebAppAuthError("Invalid auth_date") from exc

    now = int(time.time())

    if auth_date <= 0:
        raise WebAppAuthError("Missing auth_date")

    if auth_date > now + 60:
        raise WebAppAuthError("auth_date is in the future")

    if max_age_seconds > 0 and now - auth_date > max_age_seconds:
        raise WebAppAuthError("Expired init data")

    result: dict[str, Any] = dict(values)

    raw_user = values.get("user")
    if raw_user:
        try:
            user = json.loads(raw_user)
        except json.JSONDecodeError as exc:
            raise WebAppAuthError("Invalid user JSON") from exc

        if not isinstance(user, dict):
            raise WebAppAuthError("Invalid user payload")

        if "id" not in user:
            raise WebAppAuthError("Missing user id")

        result["user"] = user

    return result
