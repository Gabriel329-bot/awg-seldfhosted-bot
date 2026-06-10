import json
import re
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from aiohttp import web

from bot.container import Services
from bot.handlers.common import profile_from_tg
from bot.messages import awg_config_filename
from config.settings import Settings
from models.dto import VpnKey
from models.enums import VpnKeyType
from webapp.auth import WebAppAuthError, verify_telegram_init_data


STATIC_DIR = Path(__file__).parent / "static"


def create_webapp(settings: Settings, services: Services, bot: Any | None = None) -> web.Application:
    app = web.Application(client_max_size=1024 * 1024)
    app["settings"] = settings
    app["services"] = services
    app["bot"] = bot
    app.router.add_get("/", index)
    app.router.add_get("/api/me", api_me)
    app.router.add_get("/api/profile", api_profile)
    app.router.add_get("/api/admin/summary", api_admin_summary)
    app.router.add_get("/api/admin/health", api_admin_health)
    app.router.add_get("/api/admin/audit", api_admin_audit)
    app.router.add_get("/api/admin/modules", api_admin_modules)
    app.router.add_post("/api/admin/modules/{name}/enable", api_admin_module_enable)
    app.router.add_post("/api/admin/modules/{name}/disable", api_admin_module_disable)
    app.router.add_get("/api/admin/requests", api_admin_requests)
    app.router.add_get("/api/admin/users", api_admin_users)
    app.router.add_get("/api/admin/users/search", api_admin_users_search)
    app.router.add_get("/api/admin/users/{user_id}", api_admin_user_detail)
    app.router.add_get("/api/admin/users/{user_id}/keys", api_admin_user_keys)
    app.router.add_get("/api/admin/users/{user_id}/proxy", api_admin_user_proxy)
    app.router.add_post("/api/admin/users/{user_id}/proxy/socks5", api_admin_issue_socks5)
    app.router.add_post("/api/admin/users/{user_id}/proxy/mtproto", api_admin_issue_mtproto)
    app.router.add_post("/api/admin/proxy/{access_id}/revoke", api_admin_proxy_revoke)
    app.router.add_post("/api/admin/proxy/{access_id}/delete", api_admin_proxy_delete)
    app.router.add_post("/api/admin/users/{user_id}/keys/issue", api_admin_issue_user_key)
    app.router.add_get("/api/admin/keys/{key_id}/share", api_admin_key_share)
    app.router.add_get("/api/admin/keys/{key_id}/download", api_admin_key_download)
    app.router.add_get("/api/admin/keys/{key_id}/traffic", api_admin_key_traffic)
    app.router.add_post("/api/admin/keys/{key_id}/revoke", api_admin_key_revoke)
    app.router.add_post("/api/admin/keys/{key_id}/delete", api_admin_key_delete)
    app.router.add_post("/api/admin/users/{user_id}/approve", api_admin_user_approve)
    app.router.add_post("/api/admin/users/{user_id}/block", api_admin_user_block)
    app.router.add_post("/api/admin/users/{user_id}/unblock", api_admin_user_unblock)
    app.router.add_post("/api/admin/users/{user_id}/toggle-moderator", api_admin_user_toggle_moderator)
    app.router.add_post("/api/admin/users/{user_id}/role", api_admin_user_set_role)
    app.router.add_post("/api/admin/requests/{request_id}/approve", api_admin_request_approve)
    app.router.add_post("/api/admin/requests/{request_id}/reject", api_admin_request_reject)
    app.router.add_get("/api/keys", api_keys)
    app.router.add_get("/api/modules", api_modules)
    app.router.add_get("/api/proxy", api_proxy_list)
    app.router.add_post("/api/proxy/socks5", api_proxy_create_socks5)
    app.router.add_post("/api/proxy/mtproto", api_proxy_create_mtproto)
    app.router.add_get("/api/proxy/stats", api_proxy_stats)
    app.router.add_post("/api/proxy/{access_id}/revoke", api_proxy_revoke)
    app.router.add_post("/api/proxy/{access_id}/delete", api_proxy_delete)
    app.router.add_post("/api/keys/awg", api_create_awg_key)
    app.router.add_post("/api/keys/xray", api_create_xray_key)
    app.router.add_get("/api/keys/{key_id}/share", api_key_share_link)
    app.router.add_get("/api/keys/{key_id}/traffic", api_key_traffic)
    app.router.add_get("/api/keys/{key_id}/download", api_download_key_config)
    app.router.add_post("/api/keys/{key_id}/revoke", api_revoke_key)
    app.router.add_post("/api/keys/{key_id}/delete", api_delete_key)
    app.router.add_static("/static", STATIC_DIR, show_index=False)
    return app


async def index(request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def api_me(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    return web.json_response({"ok": True, "user": user})


async def api_profile(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    user_id = int(user["id"])

    try:
        db_user = await services.users.get_user(user_id)
        keys_count = await services.vpn_keys.count_for_actor(user_id)
        awg_enabled = await services.modules.is_enabled("awg")
        xray_enabled = await services.modules.is_enabled("xray")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "telegram": {
                "id": user.get("id"),
                "username": user.get("username"),
                "first_name": user.get("first_name"),
                "last_name": user.get("last_name"),
            },
            "access": {
                "role": getattr(db_user.role, "value", str(db_user.role)),
                "status": _access_status(db_user),
                "is_blocked": _is_blocked_status(db_user),
            },
            "keys": {
                "total": keys_count,
            },
            "modules": {
                "awg": awg_enabled,
                "xray": xray_enabled,
                "xray_xhttp": xray_enabled and services.settings.xray_xhttp_enabled,
                "socks5": services.settings.socks5_enabled and await services.modules.is_enabled("socks5"),
                "mtproto": services.settings.mtproto_enabled and await services.modules.is_enabled("mtproto"),
            },
        }
    )


async def api_admin_modules(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        await services.users.require_superadmin(actor_id)
        modules = await services.modules.get_all()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "modules": [_module_to_json(module) for module in modules],
        }
    )


async def api_admin_module_enable(request: web.Request) -> web.Response:
    return await _api_admin_module_action(request, enabled=True)


async def api_admin_module_disable(request: web.Request) -> web.Response:
    return await _api_admin_module_action(request, enabled=False)


async def _api_admin_module_action(request: web.Request, *, enabled: bool) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])
    name = str(request.match_info["name"] or "").strip().lower()

    if name not in {"xray", "awg", "socks5", "mtproto"}:
        return web.json_response({"ok": False, "error": "Unknown protocol"}, status=400)

    try:
        await services.users.require_superadmin(actor_id)
        if enabled:
            await services.modules.enable_protocol(name, actor_id)
            deleted = 0
        else:
            deleted = await services.modules.disable_protocol(name, actor_id)
        modules = await services.modules.get_all()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "protocol": name,
            "enabled": enabled,
            "deleted": deleted,
            "modules": [_module_to_json(module) for module in modules],
        }
    )


async def api_admin_audit(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        page = max(int(request.query.get("page", "0")), 0)
    except ValueError:
        page = 0

    limit = 30
    offset = page * limit

    try:
        await services.users.require_superadmin(actor_id)
        total = await services.audit.count_all(actor_id)
        items = await services.audit.recent(actor_user_id=actor_id, limit=limit, offset=offset)
        actor_ids = [
            int(item.get("actor_user_id"))
            for item in items
            if isinstance(item, dict) and item.get("actor_user_id") is not None
        ]
        users_by_id = {}
        if actor_ids:
            users_result = await services.users.users.list_by_ids(actor_ids)
            if isinstance(users_result, dict):
                users_by_id = users_result
            else:
                users_by_id = {
                    getattr(item, "telegram_user_id"): item
                    for item in users_result
                    if hasattr(item, "telegram_user_id")
                }
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "page": page,
            "total": total,
            "items": [_audit_item_to_json(item, users_by_id) for item in items],
        }
    )


async def api_admin_health(request: web.Request) -> web.Response:
    import asyncio
    import shutil

    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        await services.users.require_superadmin(actor_id)
        modules = await services.modules.get_all()
        users_count = await services.users.count_users(actor_id)
        pending_requests = await services.access.count_pending(actor_id)
        key_count = await services.vpn_keys.count_for_actor(actor_id)
        service_names = [
            "vpn-bot",
            services.settings.xray_service_name,
            services.settings.mtproto_service_name,
            services.settings.socks5_service_name,
            "nginx",
        ]
        service_statuses = await _systemctl_statuses(service_names)
        ports = await _listening_ports((443, 8443, 9443, 8088, 10085))
        disk = shutil.disk_usage(str(services.settings.db_path.parent))
        load_avg = _load_average()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "summary": {
                "users": users_count,
                "pending_requests": pending_requests,
                "keys_visible_to_admin": key_count,
            },
            "modules": [_module_to_json(module) for module in modules],
            "services": service_statuses,
            "ports": ports,
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "total_h": _format_bytes(disk.total),
                "used_h": _format_bytes(disk.used),
                "free_h": _format_bytes(disk.free),
            },
            "load": load_avg,
        }
    )


async def _systemctl_statuses(names: list[str]) -> list[dict[str, Any]]:
    result = []
    seen = set()
    for name in names:
        if not name or name in seen:
            continue
        seen.add(name)
        proc = await __import__("asyncio").create_subprocess_exec(
            "systemctl",
            "is-active",
            name,
            stdout=__import__("asyncio").subprocess.PIPE,
            stderr=__import__("asyncio").subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        status = (stdout or stderr).decode("utf-8", "replace").strip() or "unknown"
        result.append({"name": name, "active": status == "active", "status": status})
    return result


async def _listening_ports(ports: tuple[int, ...]) -> list[dict[str, Any]]:
    proc = await __import__("asyncio").create_subprocess_exec(
        "ss",
        "-lntp",
        stdout=__import__("asyncio").subprocess.PIPE,
        stderr=__import__("asyncio").subprocess.PIPE,
    )
    stdout, _stderr = await proc.communicate()
    output = stdout.decode("utf-8", "replace")
    result = []
    for port in ports:
        needle = f":{port}"
        lines = [line for line in output.splitlines() if needle in line]
        result.append(
            {
                "port": port,
                "listening": bool(lines),
                "raw": lines[0] if lines else "",
            }
        )
    return result


def _load_average() -> dict[str, float] | None:
    try:
        one, five, fifteen = __import__("os").getloadavg()
    except (AttributeError, OSError):
        return None
    return {"1m": one, "5m": five, "15m": fifteen}


async def api_admin_summary(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        actor = await services.users.require_moderator_or_admin(actor_id)
        pending_requests = await services.access.count_pending(actor_id)
        users_count = await services.users.count_users(actor_id)
        role = getattr(actor.role, "value", str(actor.role))
        data: dict[str, Any] = {
            "ok": True,
            "role": role,
            "pending_requests": pending_requests,
            "users_count": users_count,
            "is_superadmin": role == "superadmin",
        }
        if role == "superadmin":
            modules = await services.modules.get_all()
            data["modules"] = [
                {
                    "name": getattr(module, "name", ""),
                    "enabled": bool(getattr(module, "enabled", False)),
                }
                for module in modules
            ]
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(data)


async def api_admin_users_search(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])
    query = str(request.query.get("q") or "").strip().lstrip("@")

    if len(query) < 2:
        return web.json_response({"ok": True, "query": query, "users": []})

    try:
        await services.users.require_moderator_or_admin(actor_id)

        matches = []
        if query.isdigit():
            try:
                found = await services.users.get_user(int(query))
                matches.append(found)
            except Exception:
                pass

        # Repository may not have search, so do a bounded scan.
        # This keeps it simple and safe for current small/medium bot databases.
        all_users = await services.users.list_users(actor_id, limit=500, offset=0)
        query_lower = query.lower()
        for item in all_users:
            username = str(getattr(item, "username", "") or "").lower()
            first_name = str(getattr(item, "first_name", "") or "").lower()
            user_id = str(getattr(item, "telegram_user_id", "") or "")
            if query_lower in username or query_lower in first_name or query in user_id:
                if all(existing.telegram_user_id != item.telegram_user_id for existing in matches):
                    matches.append(item)

        matches = matches[:30]
        key_counts = await services.users.count_keys_for_users(actor_id, [item.telegram_user_id for item in matches])
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "query": query,
            "users": [_admin_user_to_json(item, key_counts.get(item.telegram_user_id, 0)) for item in matches],
        }
    )


async def api_admin_users(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        page = max(int(request.query.get("page", "0")), 0)
    except ValueError:
        page = 0

    limit = 20
    offset = page * limit

    try:
        actor = await services.users.require_moderator_or_admin(actor_id)
        total = await services.users.count_users(actor_id)
        users = await services.users.list_users(actor_id, limit=limit, offset=offset)
        key_counts = await services.users.count_keys_for_users(actor_id, [item.telegram_user_id for item in users])
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "page": page,
            "total": total,
            "actor_role": getattr(actor.role, "value", str(actor.role)),
            "users": [_admin_user_to_json(item, key_counts.get(item.telegram_user_id, 0)) for item in users],
        }
    )


async def api_admin_issue_user_key(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        body = await _json_body(request)
        key_type = str(body.get("type") or "").strip().lower()
        note = _clean_note(body.get("note"))
        mtu = _parse_optional_int(body.get("mtu"))
        fingerprint = str(body.get("fingerprint") or "chrome").strip().lower()
        transport = str(body.get("transport") or "tcp").strip().lower()
        if transport not in {"tcp", "http"}:
            transport = "tcp"

        await services.users.require_superadmin(actor_id)
        target = await services.users.get_user(target_user_id)
        profile = _user_to_profile(target)

        if key_type == "awg":
            if not await services.modules.is_enabled("awg"):
                return web.json_response({"ok": False, "error": "AWG protocol is disabled"}, status=400)
            result = await services.awg.create_awg_key(actor_id, profile, note, expires_at=None, mtu=mtu)
            share_link = _extract_link(await services.awg.get_awg_client_config(actor_id, result.key.id), "vpn://")
        elif key_type == "xray":
            if not await services.modules.is_enabled("xray"):
                return web.json_response({"ok": False, "error": "Xray protocol is disabled"}, status=400)
            if transport == "http" and not services.settings.xray_xhttp_enabled:
                return web.json_response({"ok": False, "error": "VLESS HTTP transport is disabled"}, status=400)
            result = await services.xray.create_xray_key(
                actor_id,
                profile,
                note,
                expires_at=None,
                fingerprint=fingerprint,
                transport=transport,
            )
            share_link = _extract_link(await services.xray.get_xray_key_config(actor_id, result.key.id), "vless://")
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "key": _key_to_json(result.key),
            "share_link": share_link,
        }
    )


async def api_admin_user_proxy(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        await services.users.require_superadmin(actor_id)
        target = await services.users.get_user(target_user_id)
        accesses = await services.proxy.list_all_user_accesses_for_admin(actor_id, target_user_id)
        socks5_enabled = services.settings.socks5_enabled and await services.modules.is_enabled("socks5")
        mtproto_enabled = services.settings.mtproto_enabled and await services.modules.is_enabled("mtproto")
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "user": _admin_user_to_json(target),
            "accesses": [_proxy_access_to_json(access) for access in accesses],
            "modules": {
                "socks5": socks5_enabled,
                "mtproto": mtproto_enabled,
            },
        }
    )


async def api_admin_issue_socks5(request: web.Request) -> web.Response:
    return await _api_admin_issue_proxy(request, "socks5")


async def api_admin_issue_mtproto(request: web.Request) -> web.Response:
    return await _api_admin_issue_proxy(request, "mtproto")


async def _api_admin_issue_proxy(request: web.Request, access_type: str) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        await services.users.require_superadmin(actor_id)
        target = await services.users.get_user(target_user_id)
        profile = _user_to_profile(target)

        if access_type == "socks5":
            if not services.settings.socks5_enabled or not await services.modules.is_enabled("socks5"):
                return web.json_response({"ok": False, "error": "SOCKS5 is disabled"}, status=400)
            access = await services.socks5.issue_socks5_proxy(actor_id, profile)
        elif access_type == "mtproto":
            if not services.settings.mtproto_enabled or not await services.modules.is_enabled("mtproto"):
                return web.json_response({"ok": False, "error": "MTProto is disabled"}, status=400)
            access = await services.mtproto.issue_mtproto_proxy(actor_id, profile)
        else:
            return web.json_response({"ok": False, "error": "Unsupported proxy type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "access": _proxy_access_to_json(access)})


async def api_admin_proxy_revoke(request: web.Request) -> web.Response:
    return await _api_admin_proxy_mutation(request, "revoke")


async def api_admin_proxy_delete(request: web.Request) -> web.Response:
    return await _api_admin_proxy_mutation(request, "delete")


async def _api_admin_proxy_mutation(request: web.Request, action: str) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        access_id = int(request.match_info["access_id"])
        await services.users.require_superadmin(actor_id)
        access = await services.proxy.accesses.get_by_id(access_id)
        if access is None:
            return web.json_response({"ok": False, "error": "Proxy access not found"}, status=404)

        access_type = getattr(getattr(access, "access_type", None), "value", str(getattr(access, "access_type", "")))
        if access_type == "socks5":
            if action == "revoke":
                updated = await services.socks5.revoke_socks5_proxy(actor_id, access_id, "admin requested revoke")
            else:
                updated = await services.socks5.delete_socks5_proxy(actor_id, access_id, "admin requested delete")
        elif access_type == "mtproto":
            if action == "revoke":
                updated = await services.mtproto.revoke_mtproto_proxy(actor_id, access_id, "admin requested revoke")
            else:
                updated = await services.mtproto.delete_mtproto_proxy(actor_id, access_id, "admin requested delete")
        else:
            return web.json_response({"ok": False, "error": "Unsupported proxy type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid proxy id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "access": _proxy_access_to_json(updated)})


async def api_admin_user_keys(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        await services.users.require_superadmin(actor_id)
        keys = await services.vpn_keys.list_for_actor(actor_id, owner_user_id=target_user_id, limit=100)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "user_id": target_user_id, "keys": [_key_to_json(key) for key in keys]})


async def api_admin_key_share(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        key_id = int(request.match_info["key_id"])
        await services.users.require_superadmin(actor_id)
        key = await services.vpn_keys.get_for_actor(actor_id, key_id)
        if key.key_type == VpnKeyType.AWG:
            share_link = _extract_link(await services.awg.get_awg_client_config(actor_id, key_id), "vpn://")
        elif key.key_type == VpnKeyType.XRAY:
            share_link = _extract_link(await services.xray.get_xray_key_config(actor_id, key_id), "vless://")
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "key_id": key.id, "type": key.key_type.value, "share_link": share_link})


async def api_admin_key_download(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        key_id = int(request.match_info["key_id"])
        await services.users.require_superadmin(actor_id)
        key = await services.vpn_keys.get_for_actor(actor_id, key_id)
        if key.key_type != VpnKeyType.AWG:
            return web.json_response({"ok": False, "error": "Download is available only for AWG keys"}, status=400)
        config = await services.awg.get_awg_client_config_plain(actor_id, key_id)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.Response(
        body=config.encode("utf-8"),
        content_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{awg_config_filename(key)}"',
            "Cache-Control": "no-store",
        },
    )


async def api_admin_key_traffic(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        key_id = int(request.match_info["key_id"])
        await services.users.require_superadmin(actor_id)
        view = await services.traffic_stats.refresh_for_actor(actor_id, key_id)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    downloaded, uploaded = _traffic_bytes(view)
    return web.json_response(
        {
            "ok": True,
            "key_id": key_id,
            "downloaded_bytes": downloaded,
            "uploaded_bytes": uploaded,
            "downloaded": _format_bytes(downloaded),
            "uploaded": _format_bytes(uploaded),
        }
    )


async def api_admin_key_revoke(request: web.Request) -> web.Response:
    return await _api_admin_key_mutation(request, action="revoke")


async def api_admin_key_delete(request: web.Request) -> web.Response:
    return await _api_admin_key_mutation(request, action="delete")


async def _api_admin_key_mutation(request: web.Request, *, action: str) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        key_id = int(request.match_info["key_id"])
        await services.users.require_superadmin(actor_id)
        key = await services.vpn_keys.get_for_actor(actor_id, key_id)

        if key.key_type == VpnKeyType.XRAY:
            if action == "revoke":
                updated = await services.xray.revoke_xray_key(actor_id, key_id)
            else:
                await services.xray.delete_xray_key(actor_id, key_id)
                updated = None
        elif key.key_type == VpnKeyType.AWG:
            if action == "revoke":
                updated = await services.awg.revoke_awg_key(actor_id, key_id)
            else:
                await services.awg.delete_awg_key(actor_id, key_id)
                updated = None
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "key": _key_to_json(updated) if updated is not None else None})


async def api_admin_user_detail(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        actor = await services.users.require_moderator_or_admin(actor_id)
        target = await services.users.get_user(target_user_id)
        key_counts = await services.users.count_keys_for_users(actor_id, [target_user_id])
        try:
            keys = await services.vpn_keys.list_for_actor(actor_id, owner_user_id=target_user_id, limit=10)
        except Exception:
            keys = []
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "actor_role": getattr(actor.role, "value", str(actor.role)),
            "user": _admin_user_to_json(target, key_counts.get(target_user_id, 0)),
            "keys": [_key_to_json(key) for key in keys],
        }
    )


async def api_admin_user_approve(request: web.Request) -> web.Response:
    return await _api_admin_user_action(request, "approve")


async def api_admin_user_block(request: web.Request) -> web.Response:
    return await _api_admin_user_action(request, "block")


async def api_admin_user_unblock(request: web.Request) -> web.Response:
    return await _api_admin_user_action(request, "unblock")


async def api_admin_user_toggle_moderator(request: web.Request) -> web.Response:
    return await _api_admin_user_action(request, "toggle_moderator")


async def api_admin_user_set_role(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])
        body = await _json_body(request)
        role_value = str(body.get("role") or "").strip().lower()
        UserRole = __import__("models.enums", fromlist=["UserRole"]).UserRole

        role_map = {
            "pending_user": UserRole.PENDING_USER,
            "approved_user": UserRole.APPROVED_USER,
            "moderator": UserRole.MODERATOR,
            "blocked_user": UserRole.BLOCKED_USER,
        }
        if role_value not in role_map:
            return web.json_response({"ok": False, "error": "Unsupported role"}, status=400)

        await services.users.require_superadmin(actor_id)
        target = await services.users.get_user(target_user_id)
        if getattr(target.role, "value", str(target.role)) == "superadmin":
            return web.json_response({"ok": False, "error": "Нельзя изменить роль SUPERADMIN"}, status=400)

        if role_value == "blocked_user":
            await services.users.block_user(actor_id, target_user_id, revoke_active_keys=True)
        elif role_value == "approved_user" and _is_blocked_status(target):
            await services.users.unblock_user(actor_id, target_user_id)
        else:
            await services.users.set_role(actor_id, target_user_id, role_map[role_value])

        updated = await services.users.get_user(target_user_id)
        key_counts = await services.users.count_keys_for_users(actor_id, [target_user_id])
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "user": _admin_user_to_json(updated, key_counts.get(target_user_id, 0))})


async def _api_admin_user_action(request: web.Request, action: str) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    bot = request.app.get("bot")
    actor_id = int(user["id"])

    try:
        target_user_id = int(request.match_info["user_id"])

        if action == "approve":
            await services.users.set_role(actor_id, target_user_id, __import__("models.enums", fromlist=["UserRole"]).UserRole.APPROVED_USER)
            notify_text = "✅ Ваш доступ одобрен. Отправьте /start, чтобы открыть кабинет."
        elif action == "block":
            await services.users.block_user(actor_id, target_user_id, revoke_active_keys=True)
            notify_text = "⛔ Ваш доступ заблокирован."
        elif action == "unblock":
            await services.users.unblock_user(actor_id, target_user_id)
            notify_text = "✅ Ваш доступ разблокирован."
        elif action == "toggle_moderator":
            UserRole = __import__("models.enums", fromlist=["UserRole"]).UserRole
            await services.users.require_superadmin(actor_id)
            target = await services.users.get_user(target_user_id)
            new_role = UserRole.APPROVED_USER if target.role == UserRole.MODERATOR else UserRole.MODERATOR
            await services.users.set_role(actor_id, target_user_id, new_role)
            notify_text = None
        else:
            return web.json_response({"ok": False, "error": "Unsupported action"}, status=400)

        if notify_text and bot is not None:
            try:
                await bot.send_message(target_user_id, notify_text)
            except Exception:
                pass

        updated = await services.users.get_user(target_user_id)
        key_counts = await services.users.count_keys_for_users(actor_id, [target_user_id])
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid user id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "user": _admin_user_to_json(updated, key_counts.get(target_user_id, 0))})


async def api_admin_requests(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    actor_id = int(user["id"])

    try:
        page = max(int(request.query.get("page", "0")), 0)
    except ValueError:
        page = 0

    limit = 20
    offset = page * limit

    try:
        await services.users.require_moderator_or_admin(actor_id)
        total = await services.access.count_pending(actor_id)
        items = await services.access.list_pending(actor_id, limit=limit, offset=offset)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "page": page,
            "total": total,
            "requests": [_access_request_to_json(item) for item in items],
        }
    )


async def api_admin_request_approve(request: web.Request) -> web.Response:
    return await _api_admin_request_decision(request, "approve")


async def api_admin_request_reject(request: web.Request) -> web.Response:
    return await _api_admin_request_decision(request, "reject")


async def _api_admin_request_decision(request: web.Request, action: str) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    bot = request.app.get("bot")
    actor_id = int(user["id"])

    try:
        request_id = int(request.match_info["request_id"])
        if action == "approve":
            access_request, changed = await services.access.approve(actor_id, request_id)
            notify_text = "✅ Ваша заявка одобрена. Отправьте /start, чтобы открыть кабинет."
        else:
            access_request, changed = await services.access.reject(actor_id, request_id)
            notify_text = "❌ Ваша заявка отклонена."

        if changed and bot is not None:
            try:
                await bot.send_message(access_request.telegram_user_id, notify_text)
            except Exception:
                pass
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid request id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "changed": changed,
            "request": _access_request_to_json(access_request),
        }
    )


async def api_keys(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    try:
        keys = await services.vpn_keys.list_for_actor(int(user["id"]), limit=50, offset=0)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)
    return web.json_response({"ok": True, "keys": [_key_to_json(key) for key in keys]})


async def api_modules(request: web.Request) -> web.Response:
    _telegram_user(request)
    services: Services = request.app["services"]

    try:
        awg_enabled = await services.modules.is_enabled("awg")
        xray_enabled = await services.modules.is_enabled("xray")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

    return web.json_response(
        {
            "ok": True,
            "modules": {
                "awg": awg_enabled,
                "xray": xray_enabled,
                "xray_xhttp": xray_enabled and services.settings.xray_xhttp_enabled,
                "socks5": services.settings.socks5_enabled and await services.modules.is_enabled("socks5"),
                "mtproto": services.settings.mtproto_enabled and await services.modules.is_enabled("mtproto"),
            },
        }
    )


async def api_proxy_list(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        accesses = await services.proxy.list_user_accesses(int(user["id"]))
        socks5_enabled = services.settings.socks5_enabled and await services.modules.is_enabled("socks5")
        mtproto_enabled = services.settings.mtproto_enabled and await services.modules.is_enabled("mtproto")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "accesses": [_proxy_access_to_json(access) for access in accesses],
            "modules": {
                "socks5": socks5_enabled,
                "mtproto": mtproto_enabled,
            },
        }
    )


async def api_proxy_create_socks5(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        if not services.settings.socks5_enabled or not await services.modules.is_enabled("socks5"):
            return web.json_response({"ok": False, "error": "SOCKS5 is disabled"}, status=400)
        profile = profile_from_tg(_webapp_user_to_tg_user(user))
        access = await services.socks5.issue_socks5_proxy(int(user["id"]), profile)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "access": _proxy_access_to_json(access)})


async def api_proxy_create_mtproto(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        if not services.settings.mtproto_enabled or not await services.modules.is_enabled("mtproto"):
            return web.json_response({"ok": False, "error": "MTProto is disabled"}, status=400)
        profile = profile_from_tg(_webapp_user_to_tg_user(user))
        access = await services.mtproto.issue_mtproto_proxy(int(user["id"]), profile)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "access": _proxy_access_to_json(access)})


async def api_proxy_revoke(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        access_id = int(request.match_info["access_id"])
        accesses = await services.proxy.list_user_accesses(int(user["id"]))
        access = next((item for item in accesses if item.id == access_id), None)
        if access is None:
            return web.json_response({"ok": False, "error": "Proxy access not found"}, status=404)

        access_type = getattr(getattr(access, "access_type", None), "value", str(getattr(access, "access_type", "")))
        if access_type == "socks5":
            updated = await services.socks5.revoke_own_socks5_proxy(int(user["id"]), access_id)
        elif access_type == "mtproto":
            updated = await services.mtproto.revoke_own_mtproto_proxy(int(user["id"]), access_id)
        else:
            return web.json_response({"ok": False, "error": "Unsupported proxy type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid proxy id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "access": _proxy_access_to_json(updated)})


async def api_proxy_delete(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        access_id = int(request.match_info["access_id"])
        accesses = await services.proxy.list_user_accesses(int(user["id"]))
        access = next((item for item in accesses if item.id == access_id), None)
        if access is None:
            return web.json_response({"ok": False, "error": "Proxy access not found"}, status=404)

        access_type = getattr(getattr(access, "access_type", None), "value", str(getattr(access, "access_type", "")))
        if access_type == "socks5":
            await services.socks5.delete_own_socks5_proxy(int(user["id"]), access_id)
        elif access_type == "mtproto":
            await services.mtproto.delete_own_mtproto_proxy(int(user["id"]), access_id)
        else:
            return web.json_response({"ok": False, "error": "Unsupported proxy type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid proxy id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True})


async def api_proxy_stats(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        stats = await services.proxy.get_user_proxy_stats(int(user["id"]))
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "stats": _proxy_stats_to_json(stats)})


async def api_create_awg_key(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    body = await _json_body(request)

    note = _clean_note(body.get("note"))
    mtu = _parse_optional_int(body.get("mtu"))

    try:
        if not await services.modules.is_enabled("awg"):
            return web.json_response({"ok": False, "error": "AWG protocol is disabled"}, status=400)
        profile = profile_from_tg(_webapp_user_to_tg_user(user))
        result = await services.awg.create_awg_key(int(user["id"]), profile, note, expires_at=None, mtu=mtu)
        share_link = _extract_link(await services.awg.get_awg_client_config(int(user["id"]), result.key.id), "vpn://")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response(
        {
            "ok": True,
            "key": _key_to_json(result.key),
            "share_link": share_link,
            "download_url": f"/api/keys/{result.key.id}/download",
        }
    )


async def api_create_xray_key(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]
    body = await _json_body(request)

    note = _clean_note(body.get("note"))
    fingerprint = str(body.get("fingerprint") or "chrome").strip().lower()
    transport = str(body.get("transport") or "tcp").strip().lower()
    if transport not in {"tcp", "http"}:
        transport = "tcp"

    try:
        if not await services.modules.is_enabled("xray"):
            return web.json_response({"ok": False, "error": "Xray protocol is disabled"}, status=400)
        if transport == "http" and not services.settings.xray_xhttp_enabled:
            return web.json_response({"ok": False, "error": "VLESS HTTP transport is disabled"}, status=400)
        profile = profile_from_tg(_webapp_user_to_tg_user(user))
        result = await services.xray.create_xray_key(
            int(user["id"]),
            profile,
            note,
            expires_at=None,
            fingerprint=fingerprint,
            transport=transport,
        )
        share_link = _extract_link(await services.xray.get_xray_key_config(int(user["id"]), result.key.id), "vless://")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "key": _key_to_json(result.key), "share_link": share_link})


async def api_key_share_link(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        key_id = int(request.match_info["key_id"])
        key = await services.vpn_keys.get_for_actor(int(user["id"]), key_id)
        if key.key_type == VpnKeyType.AWG:
            share_link = _extract_link(await services.awg.get_awg_client_config(int(user["id"]), key_id), "vpn://")
        elif key.key_type == VpnKeyType.XRAY:
            share_link = _extract_link(await services.xray.get_xray_key_config(int(user["id"]), key_id), "vless://")
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "key_id": key.id, "type": key.key_type.value, "share_link": share_link})


async def api_key_traffic(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        key_id = int(request.match_info["key_id"])
        view = await services.traffic_stats.refresh_for_actor(int(user["id"]), key_id)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    downloaded, uploaded = _traffic_bytes(view)
    return web.json_response(
        {
            "ok": True,
            "key_id": key_id,
            "downloaded_bytes": downloaded,
            "uploaded_bytes": uploaded,
            "downloaded": _format_bytes(downloaded),
            "uploaded": _format_bytes(uploaded),
        }
    )


async def api_download_key_config(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        key_id = int(request.match_info["key_id"])
        key = await services.vpn_keys.get_for_actor(int(user["id"]), key_id)
        if key.key_type != VpnKeyType.AWG:
            return web.json_response({"ok": False, "error": "Download is available only for AWG keys"}, status=400)
        config = await services.awg.get_awg_client_config_plain(int(user["id"]), key_id)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.Response(
        body=config.encode("utf-8"),
        content_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{awg_config_filename(key)}"',
            "Cache-Control": "no-store",
        },
    )


async def api_revoke_key(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        key_id = int(request.match_info["key_id"])
        key = await services.vpn_keys.get_for_actor(int(user["id"]), key_id)
        if key.key_type == VpnKeyType.XRAY:
            updated = await services.xray.revoke_xray_key(int(user["id"]), key_id)
        elif key.key_type == VpnKeyType.AWG:
            updated = await services.awg.revoke_awg_key(int(user["id"]), key_id)
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True, "key": _key_to_json(updated)})


async def api_delete_key(request: web.Request) -> web.Response:
    user = _telegram_user(request)
    services: Services = request.app["services"]

    try:
        key_id = int(request.match_info["key_id"])
        key = await services.vpn_keys.get_for_actor(int(user["id"]), key_id)
        if key.key_type == VpnKeyType.XRAY:
            await services.xray.delete_xray_key(int(user["id"]), key_id)
        elif key.key_type == VpnKeyType.AWG:
            await services.awg.delete_awg_key(int(user["id"]), key_id)
        else:
            return web.json_response({"ok": False, "error": "Unsupported key type"}, status=400)
    except ValueError:
        return web.json_response({"ok": False, "error": "Invalid key id"}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=403)

    return web.json_response({"ok": True})


async def _json_body(request: web.Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return {}
    return body if isinstance(body, dict) else {}


def _telegram_user(request: web.Request) -> dict[str, Any]:
    settings = request.app["settings"]
    init_data = request.headers.get("X-Telegram-Init-Data", "")

    try:
        values = verify_telegram_init_data(
            init_data,
            settings.bot_token,
            max_age_seconds=getattr(settings, "webapp_init_data_max_age_seconds", 86400),
        )
    except WebAppAuthError as exc:
        raise web.HTTPUnauthorized(
            text=json.dumps({"ok": False, "error": "unauthorized"}),
            content_type="application/json",
        ) from exc

    user = values.get("user")
    if not isinstance(user, dict):
        raise web.HTTPUnauthorized(
            text=json.dumps({"ok": False, "error": "unauthorized"}),
            content_type="application/json",
        )

    return user

def _user_to_profile(user: Any) -> Any:
    return __import__("models.dto", fromlist=["TelegramUserProfile"]).TelegramUserProfile(
        getattr(user, "telegram_user_id"),
        getattr(user, "username", None),
        getattr(user, "first_name", None),
    )


def _webapp_user_to_tg_user(user: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(
        id=int(user["id"]),
        username=user.get("username"),
        first_name=user.get("first_name"),
        last_name=user.get("last_name"),
    )


def _key_to_json(key: VpnKey) -> dict[str, Any]:
    return {
        "id": key.id,
        "type": key.key_type.value,
        "status": key.status.value,
        "note": key.note,
        "transport": key.transport,
        "created_at": key.created_at,
        "updated_at": key.updated_at,
        "expires_at": key.expires_at,
        "client_ip": key.client_ip,
        "email_label": key.email_label,
        "share_url": f"/api/keys/{key.id}/share" if key.key_type in {VpnKeyType.AWG, VpnKeyType.XRAY} else None,
        "download_url": f"/api/keys/{key.id}/download" if key.key_type == VpnKeyType.AWG else None,
    }


def _audit_item_to_json(item: Any, users_by_id: dict[int, Any]) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {"raw": str(item)}

    actor_user_id = item.get("actor_user_id")
    actor = users_by_id.get(int(actor_user_id)) if actor_user_id is not None else None

    return {
        "id": item.get("id"),
        "actor_user_id": actor_user_id,
        "actor_username": getattr(actor, "username", None) if actor is not None else None,
        "action": item.get("action"),
        "entity_type": _enum_value(item.get("entity_type")),
        "entity_id": item.get("entity_id"),
        "details": item.get("details"),
        "created_at": item.get("created_at"),
    }


def _module_to_json(module: Any) -> dict[str, Any]:
    return {
        "name": getattr(module, "name", ""),
        "enabled": bool(getattr(module, "enabled", False)),
        "disabled_by": getattr(module, "disabled_by", None),
        "disabled_at": getattr(module, "disabled_at", None),
    }


def _admin_user_to_json(user: Any, key_count: int = 0) -> dict[str, Any]:
    role = getattr(getattr(user, "role", None), "value", str(getattr(user, "role", "")))
    return {
        "telegram_user_id": getattr(user, "telegram_user_id", None),
        "username": getattr(user, "username", None),
        "first_name": getattr(user, "first_name", None),
        "role": role,
        "status": _access_status(user),
        "is_blocked": _is_blocked_status(user),
        "key_count": key_count,
        "created_at": getattr(user, "created_at", None),
        "updated_at": getattr(user, "updated_at", None),
        "blocked_at": getattr(user, "blocked_at", None),
        "note": getattr(user, "note", None),
    }


def _access_request_to_json(item: Any) -> dict[str, Any]:
    status = getattr(getattr(item, "status", None), "value", str(getattr(item, "status", "")))
    return {
        "id": getattr(item, "id", None),
        "telegram_user_id": getattr(item, "telegram_user_id", None),
        "username": getattr(item, "username", None),
        "status": status,
        "requested_at": getattr(item, "requested_at", None),
        "processed_at": getattr(item, "processed_at", None),
        "processed_by": getattr(item, "processed_by", None),
    }


def _proxy_access_to_json(access: Any) -> dict[str, Any]:
    payload = dict(getattr(access, "payload", {}) or {})
    public_payload = dict(getattr(access, "public_payload", {}) or {})
    access_type = getattr(getattr(access, "access_type", None), "value", str(getattr(access, "access_type", "")))
    status = getattr(getattr(access, "status", None), "value", str(getattr(access, "status", "")))

    data = {**public_payload, **payload}
    return {
        "id": getattr(access, "id", None),
        "type": access_type,
        "status": status,
        "host": data.get("host"),
        "port": data.get("port"),
        "login": data.get("login"),
        "password": data.get("password"),
        "url": data.get("url"),
        "link": data.get("link"),
        "link_dd": data.get("link_dd"),
        "secret": data.get("secret"),
        "mode": data.get("mode"),
        "public_name": data.get("public_name"),
        "note": data.get("note"),
        "created_at": getattr(access, "created_at", None),
        "shown_at": getattr(access, "shown_at", None),
    }


def _proxy_stats_to_json(stats: Any) -> dict[str, Any]:
    accesses = list(getattr(stats, "accesses", ()) or [])
    items = []
    counts: dict[str, int] = {}

    for item in accesses:
        access_type = getattr(getattr(item, "access_type", None), "value", str(getattr(item, "access_type", "")))
        status = getattr(getattr(item, "status", None), "value", str(getattr(item, "status", "")))
        counts[status] = counts.get(status, 0) + 1
        items.append(
            {
                "id": getattr(item, "id", None),
                "type": access_type,
                "status": status,
                "host": getattr(item, "host", None),
                "port": getattr(item, "port", None),
                "login": getattr(item, "login", None),
                "mtproto_mode": getattr(item, "mtproto_mode", None),
                "secret_fingerprint": getattr(item, "secret_fingerprint", None),
                "created_at": getattr(item, "created_at", None),
                "updated_at": getattr(item, "updated_at", None),
                "activated_at": getattr(item, "activated_at", None),
                "last_shown_at": getattr(item, "last_shown_at", None),
                "revoked_at": getattr(item, "revoked_at", None),
                "deleted_at": getattr(item, "deleted_at", None),
            }
        )

    return {
        "owner_user_id": getattr(stats, "owner_user_id", None),
        "total": len(items),
        "counts": counts,
        "accesses": items,
    }


def _access_status(user: Any) -> str:
    if _is_blocked_status(user):
        return "blocked"

    role = _role_value(user)
    if role in {"superadmin", "moderator", "approved_user"}:
        return "approved"
    if role == "pending_user":
        return "pending"
    return "pending"


def _is_blocked_status(user: Any) -> bool:
    role = _role_value(user)
    status = _enum_value(getattr(user, "status", "")).lower()
    if role == "blocked_user" or status in {"blocked", "banned", "blocked_user"}:
        return True
    return bool(getattr(user, "is_blocked", False) or getattr(user, "blocked", False))


def _role_value(user: Any) -> str:
    return _enum_value(getattr(user, "role", "")).lower()


def _enum_value(value: Any) -> str:
    raw = getattr(value, "value", None)
    if raw is not None:
        return str(raw)
    text = str(value)
    if "." in text:
        return text.rsplit(".", 1)[-1].lower()
    return text.lower()


def _traffic_bytes(view: Any) -> tuple[int, int]:
    candidates = [view]
    for attr in ("stats", "traffic", "entry"):
        value = getattr(view, attr, None)
        if value is not None:
            candidates.append(value)

    downloaded = _first_int_attr(
        candidates,
        ("downloaded_bytes", "download_bytes", "down_bytes", "rx_bytes", "received_bytes"),
    )
    uploaded = _first_int_attr(
        candidates,
        ("uploaded_bytes", "upload_bytes", "up_bytes", "tx_bytes", "sent_bytes"),
    )
    return downloaded, uploaded


def _first_int_attr(candidates: list[Any], names: tuple[str, ...]) -> int:
    for candidate in candidates:
        for name in names:
            value = getattr(candidate, name, None)
            if value is not None:
                try:
                    return max(int(value), 0)
                except (TypeError, ValueError):
                    pass
    return 0


def _format_bytes(value: int) -> str:
    size = float(max(value, 0))
    for unit in ("Б", "КБ", "МБ", "ГБ", "ТБ"):
        if size < 1024 or unit == "ТБ":
            if unit == "Б":
                return f"{int(size)} {unit}"
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} ТБ"


def _extract_link(value: str, scheme: str) -> str:
    match = re.search(re.escape(scheme) + r"\S+", value)
    return match.group(0).strip() if match else value.strip()


def _clean_note(value: Any) -> str | None:
    if value is None:
        return None
    note = str(value).strip()
    return note[:200] if note else None


def _parse_optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if 1 <= parsed <= 1500 else None
