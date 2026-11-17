package ru.aismp;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class AISMPPlugin extends JavaPlugin implements Listener {
    private final Set<UUID> frozen = ConcurrentHashMap.newKeySet();
    private BukkitTask countdownTask;
    private int secondsLeft;
    private boolean running;

    @Override public void onEnable() {
        saveDefaultConfig();
        Bukkit.getPluginManager().registerEvents(this, this);
        getLogger().info("AI SMP enabled. Waiting for AI clients.");
    }

    @Override public void onDisable() { stopCountdown(false); }

    private List<String> botNames() { return getConfig().getStringList("bots"); }
    private boolean isBot(Player p) { return botNames().stream().anyMatch(n -> n.equalsIgnoreCase(p.getName())); }

    @EventHandler public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        if (!isBot(p)) return;
        Bukkit.getScheduler().runTask(this, () -> {
            Location center = getCenter();
            int index = botNames().indexOf(botNames().stream().filter(n -> n.equalsIgnoreCase(p.getName())).findFirst().orElse(p.getName()));
            double angle = (Math.PI * 2.0 * Math.max(0, index)) / Math.max(1, botNames().size());
            double radius = getConfig().getDouble("circle-radius", 5.0);
            Location spot = center.clone().add(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            spot.setYaw((float) (Math.toDegrees(angle) + 180));
            p.teleport(spot);
            p.setInvulnerable(true);
            frozen.add(p.getUniqueId());
            if (!running && countdownTask == null) beginCountdown();
            announce("Подключился " + p.getName() + " (" + onlineBots() + "/" + botNames().size() + ")");
        });
    }

    @EventHandler public void onMove(PlayerMoveEvent event) {
        if (!frozen.contains(event.getPlayer().getUniqueId()) || event.getTo() == null) return;
        if (event.getFrom().getX() != event.getTo().getX() || event.getFrom().getY() != event.getTo().getY() || event.getFrom().getZ() != event.getTo().getZ()) {
            Location to = event.getFrom().clone();
            to.setYaw(event.getTo().getYaw()); to.setPitch(event.getTo().getPitch());
            event.setTo(to);
        }
    }

    private int onlineBots() { return (int) Bukkit.getOnlinePlayers().stream().filter(this::isBot).count(); }
    private Location getCenter() {
        String worldName = getConfig().getString("spawn-world", "");
        World world = worldName == null || worldName.isBlank() ? Bukkit.getWorlds().getFirst() : Bukkit.getWorld(worldName);
        if (world == null) world = Bukkit.getWorlds().getFirst();
        return world.getSpawnLocation().toHighestLocation().add(0, 1, 0);
    }
    private void announce(String message) { Bukkit.broadcastMessage("§d[AI SMP] §f" + message); }

    private void beginCountdown() {
        secondsLeft = getConfig().getInt("countdown-seconds", 60);
        announce("Все на старт! До начала симуляции: " + secondsLeft + " секунд.");
        countdownTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            if (secondsLeft <= 0) {
                stopCountdown(false);
                running = true;
                for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) {
                    frozen.remove(p.getUniqueId());
                    p.setInvulnerable(false);
                }
                announce("СТАРТ! 19 агентов начинают исследовать мир и строить свои поселения.");
                return;
            }
            if (secondsLeft <= 10 || secondsLeft % 15 == 0) announce("До старта: " + secondsLeft + "...");
            secondsLeft--;
        }, 20L, 20L);
    }

    private void stopCountdown(boolean message) {
        if (countdownTask != null) { countdownTask.cancel(); countdownTask = null; }
        if (message) announce("Запуск остановлен.");
    }

    @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || args[0].equalsIgnoreCase("status")) {
            sender.sendMessage("§dAI SMP §f| ботов онлайн: " + onlineBots() + "/" + botNames().size()
                    + " | " + (running ? "симуляция идёт" : countdownTask != null ? "старт через " + secondsLeft + "с" : "ожидание"));
            return true;
        }
        if (!sender.hasPermission("aismp.admin")) { sender.sendMessage("Нет прав."); return true; }
        if (args[0].equalsIgnoreCase("start")) {
            if (running || countdownTask != null) { sender.sendMessage("Симуляция уже запущена или идёт отсчёт."); return true; }
            for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) frozen.add(p.getUniqueId());
            beginCountdown(); return true;
        }
        if (args[0].equalsIgnoreCase("stop")) {
            stopCountdown(true); running = false;
            for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) { frozen.remove(p.getUniqueId()); p.setInvulnerable(false); }
            return true;
        }
        sender.sendMessage("Использование: /aismp <status|start|stop>");
        return true;
    }
}