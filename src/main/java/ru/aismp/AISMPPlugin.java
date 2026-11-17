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
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.List;
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
        getLogger().info("AI SMP enabled. Waiting for " + botNames().size() + " configured agents.");
    }

    @Override public void onDisable() { stopCountdown(false); }

    private List<String> botNames() { return getConfig().getStringList("bots"); }
    private boolean isBot(Player p) { return botNames().stream().anyMatch(n -> n.equalsIgnoreCase(p.getName())); }

    @EventHandler public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        if (!isBot(p)) return;
        Bukkit.getScheduler().runTask(this, () -> {
            if (!p.isOnline()) return;
            if (running) {
                p.setInvulnerable(false);
                frozen.remove(p.getUniqueId());
                announce("СТАРТ! " + p.getName() + " вернулся в симуляцию.");
                return;
            }
            placeInCircle(p);
            p.setInvulnerable(true);
            frozen.add(p.getUniqueId());
            announce("Подключился " + p.getName() + " (" + onlineBots() + "/" + botNames().size() + ")");
            if (countdownTask != null && onlineBots() < botNames().size()) {
                stopCountdown(false);
                announce("Ожидаем возвращения всех 19 агентов. Отсчёт будет начат заново.");
            }
            if (countdownTask == null && onlineBots() >= botNames().size()) beginCountdown();
        });
    }

    @EventHandler public void onQuit(PlayerQuitEvent event) {
        Player p = event.getPlayer();
        if (!isBot(p)) return;
        frozen.remove(p.getUniqueId());
        if (!running && countdownTask != null) {
            stopCountdown(false);
            announce(p.getName() + " отключился. Отсчёт приостановлен до возвращения всех агентов.");
        }
    }

    private void placeInCircle(Player p) {
        Location center = getCenter();
        int index = -1;
        for (int i = 0; i < botNames().size(); i++) {
            if (botNames().get(i).equalsIgnoreCase(p.getName())) { index = i; break; }
        }
        double angle = (Math.PI * 2.0 * Math.max(0, index)) / Math.max(1, botNames().size());
        double radius = getConfig().getDouble("circle-radius", 5.0);
        Location spot = center.clone().add(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        spot.setYaw((float) (Math.toDegrees(angle) + 180));
        p.teleport(spot);
    }

    @EventHandler public void onMove(PlayerMoveEvent event) {
        if (!frozen.contains(event.getPlayer().getUniqueId()) || event.getTo() == null) return;
        if (event.getFrom().getX() != event.getTo().getX()
                || event.getFrom().getY() != event.getTo().getY()
                || event.getFrom().getZ() != event.getTo().getZ()) {
            Location to = event.getFrom().clone();
            to.setYaw(event.getTo().getYaw());
            to.setPitch(event.getTo().getPitch());
            event.setTo(to);
        }
    }

    private int onlineBots() {
        return (int) Bukkit.getOnlinePlayers().stream().filter(this::isBot).count();
    }

    private Location getCenter() {
        String worldName = getConfig().getString("spawn-world", "");
        World world = worldName == null || worldName.isBlank()
                ? Bukkit.getWorlds().getFirst() : Bukkit.getWorld(worldName);
        if (world == null) world = Bukkit.getWorlds().getFirst();
        return world.getSpawnLocation().toHighestLocation().add(0, 1, 0);
    }

    private void announce(String message) { Bukkit.broadcastMessage("§d[AI SMP] §f" + message); }

    private void beginCountdown() {
        if (onlineBots() < botNames().size()) return;
        secondsLeft = Math.max(5, getConfig().getInt("countdown-seconds", 60));
        announce("Все агенты на месте! До начала симуляции: " + secondsLeft + " секунд.");
        countdownTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            if (onlineBots() < botNames().size()) {
                stopCountdown(false);
                announce("Не все агенты подключены. Отсчёт остановлен.");
                return;
            }
            if (secondsLeft <= 0) {
                stopCountdown(false);
                running = true;
                for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) {
                    frozen.remove(p.getUniqueId());
                    p.setInvulnerable(false);
                }
                announce("СТАРТ! 19 агентов начинают исследовать мир и основывать поселения.");
                return;
            }
            if (secondsLeft <= 10 || secondsLeft % 15 == 0) announce("До старта: " + secondsLeft + "...");
            secondsLeft--;
        }, 20L, 20L);
    }

    private void stopCountdown(boolean message) {
        if (countdownTask != null) {
            countdownTask.cancel();
            countdownTask = null;
        }
        if (message) announce("Запуск остановлен.");
    }

    @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String action = args.length == 0 ? "status" : args[0].toLowerCase();
        if (action.equals("status")) {
            sender.sendMessage("§dAI SMP §f| агенты: " + onlineBots() + "/" + botNames().size()
                    + " | " + (running ? "симуляция идёт"
                    : countdownTask != null ? "старт через " + secondsLeft + "с" : "ожидание"));
            return true;
        }
        if (!sender.hasPermission("aismp.admin")) {
            sender.sendMessage("§cНет прав. Требуется aismp.admin.");
            return true;
        }
        if (action.equals("start")) {
            if (running || countdownTask != null) {
                sender.sendMessage("§eСимуляция уже запущена или идёт отсчёт.");
                return true;
            }
            if (onlineBots() < botNames().size()) {
                sender.sendMessage("§cНужно подключить всех агентов: " + onlineBots() + "/" + botNames().size());
                return true;
            }
            for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) {
                placeInCircle(p);
                p.setInvulnerable(true);
                frozen.add(p.getUniqueId());
            }
            beginCountdown();
            return true;
        }
        if (action.equals("stop")) {
            stopCountdown(false);
            running = false;
            announce("ПАУЗА! Симуляция остановлена администратором.");
            for (Player p : Bukkit.getOnlinePlayers()) if (isBot(p)) {
                frozen.remove(p.getUniqueId());
                p.setInvulnerable(false);
            }
            return true;
        }
        sender.sendMessage("§eИспользование: /aismp <status|start|stop>");
        return true;
    }
}
