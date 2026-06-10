import asyncio
import shutil
import psutil

async def get_hardware_stats() -> str:
    # CPU нагрузка за 0.5 сек
    cpu_usage = psutil.cpu_percent(interval=0.5)
    
    # RAM (в гигабайтах)
    ram = psutil.virtual_memory()
    ram_used = ram.used / (1024 ** 3)
    ram_total = ram.total / (1024 ** 3)
    
    # Диск корневой директории
    total, used, free = shutil.disk_usage("/")
    disk_free = free / (1024 ** 3)
    disk_total = total / (1024 ** 3)
    
    # Замер сетевой скорости
    net_before = psutil.net_io_counters()
    await asyncio.sleep(1.0)
    net_after = psutil.net_io_counters()
    
    rx_speed = ((net_after.bytes_recv - net_before.bytes_recv) * 8) / (1024 * 1024)
    tx_speed = ((net_after.bytes_sent - net_before.bytes_sent) * 8) / (1024 * 1024)
    
    return (
        "📊 **СТАТУС СЕРВЕРА В РЕАЛЬНОМ ВРЕМЕНИ**\n\n"
        f"⚙️ **CPU:** {cpu_usage}%\n"
        f"🧠 **RAM:** {ram_used:.2f} GB / {ram_total:.2f} GB\n"
        f"💾 **Диск:** {disk_free:.2f} GB свободно из {disk_total:.2f} GB\n\n"
        "🌐 **Сетевая активность:**\n"
        f"📥 Входящая: {rx_speed:.2f} Mbps\n"
        f"📤 Исходящая: {tx_speed:.2f} Mbps"
    )
