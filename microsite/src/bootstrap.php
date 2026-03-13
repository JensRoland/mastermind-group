<?php
/**
 * Bootstrap — autoload, env, logger, session scanner, shared helpers.
 */

session_start();

$autoload = dirname(__DIR__) . '/vendor/autoload.php';
if (file_exists($autoload)) {
    require $autoload;

    $dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
    $dotenv->safeLoad();
}

// --- Logger (optional Better Stack) -----------------------------------------

$logger = null;
$sourceToken = $_ENV['BETTERSTACK_SOURCE_TOKEN'] ?? '';
$ingestingHost = $_ENV['BETTERSTACK_INGESTING_HOST'] ?? '';
if ($sourceToken && $ingestingHost && class_exists('Monolog\Logger')) {
    $logger = new Monolog\Logger('mastermind-microsite');
    $handler = Logtail\Monolog\LogtailHandlerBuilder::withSourceToken($sourceToken)
        ->withEndpoint('https://' . $ingestingHost)
        ->build();
    $logger->pushHandler($handler);
}

// --- Database ---------------------------------------------------------------

require __DIR__ . '/db.php';
$db = getDatabase();

// --- Config -----------------------------------------------------------------

$baseDir = dirname(__DIR__);
$sessionsDir = $baseDir . '/sessions';
$siteTitle = 'Mastermind Group Debatter';
$siteDescription = 'En samling af AI-drevne rundbordsdiskussioner, hvor syntetiske personaer debatterer og udforsker emner. <a href="/about">Lær mere</a>';
$siteUrl = 'https://ai-debatten.dk';

$clerkPublishableKey = $_ENV['CLERK_PUBLISHABLE_KEY'] ?? '';
$clerkAdminUserId = $_ENV['CLERK_ADMIN_USER_ID'] ?? '';

// Derive Clerk Frontend API domain from publishable key (pk_test_<base64>$ or pk_live_<base64>$)
$clerkFapiDomain = '';
if ($clerkPublishableKey) {
    $parts = explode('_', $clerkPublishableKey, 3);
    if (count($parts) === 3) {
        $clerkFapiDomain = rtrim(base64_decode($parts[2]), '$');
    }
}

// --- Session scanner --------------------------------------------------------

function scanSessions(string $dir): array {
    $sessions = [];
    if (!is_dir($dir)) return $sessions;

    foreach (scandir($dir) as $folder) {
        if ($folder[0] === '.') continue;
        $path = $dir . '/' . $folder;
        $htmlFile = $path . '/index.html';
        if (!is_dir($path) || !file_exists($htmlFile)) continue;

        $html = file_get_contents($htmlFile);
        $title = $folder;
        $topic = '';
        $date = '';

        if (preg_match('/<title>(.+?)<\/title>/', $html, $m)) {
            $title = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
            $title = preg_replace('/\s*[\x{2014}\x{2013}\-]\s*Mastermind Group$/u', '', $title);
        }

        if (preg_match('/<span class="thread-topic">(.+?)<\/span>/', $html, $m)) {
            $topic = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }

        if (preg_match_all('/<span class="meta-separator">·<\/span>\s*<span>(.+?)<\/span>/', $html, $m)) {
            if (!empty($m[1][0])) {
                $date = html_entity_decode($m[1][0], ENT_QUOTES, 'UTF-8');
            }
        }

        $participants = [];
        if (preg_match_all('/<li>([^<]+)\s*<span class="participant-model">/', $html, $m)) {
            $participants = array_map('trim', $m[1]);
        }

        $avatars = [];
        if (preg_match('/<div class="header-avatars">(.*?)<\/div>/s', $html, $m)) {
            $avatarBlock = $m[1];
            if (preg_match_all('/<img\s+src="avatars\/([^"]+)"\s+alt="([^"]*)"/', $avatarBlock, $am)) {
                foreach ($am[1] as $i => $file) {
                    $avatars[] = ['type' => 'img', 'file' => $file, 'name' => html_entity_decode($am[2][$i], ENT_QUOTES, 'UTF-8')];
                }
            }
            if (preg_match_all('/<div class="avatar-placeholder"[^>]*title="([^"]*)"[^>]*>([^<]+)<\/div>/', $avatarBlock, $am)) {
                foreach ($am[1] as $i => $name) {
                    $avatars[] = ['type' => 'placeholder', 'initials' => trim($am[2][$i]), 'name' => html_entity_decode($name, ENT_QUOTES, 'UTF-8')];
                }
            }
        }

        $sessions[] = [
            'slug' => $folder,
            'title' => $title,
            'topic' => $topic,
            'date' => $date,
            'participants' => $participants,
            'avatars' => $avatars,
        ];
    }

    usort($sessions, function ($a, $b) {
        return strcmp($b['date'], $a['date']) ?: strcmp($a['title'], $b['title']);
    });

    return $sessions;
}

// --- Routing helpers --------------------------------------------------------

function getRoutePath(): string {
    $requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir !== '/' && str_starts_with($requestUri, $scriptDir)) {
        $requestUri = substr($requestUri, strlen($scriptDir));
    }
    return '/' . trim($requestUri, '/');
}

function getBasePath(): string {
    return rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
}

function findSession(string $slug, array $sessions): ?array {
    foreach ($sessions as $s) {
        if ($s['slug'] === $slug) return $s;
    }
    return null;
}

function jsonResponse(mixed $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function relativeTime(string $isoDate): string {
    $ts = strtotime($isoDate);
    $diff = time() - $ts;

    if ($diff < 60) return 'lige nu';
    if ($diff < 3600) return floor($diff / 60) . ' min siden';
    if ($diff < 86400) return floor($diff / 3600) . ' t siden';
    if ($diff < 604800) return floor($diff / 86400) . ' d siden';
    return date('j. M Y', $ts);
}
