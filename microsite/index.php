<?php
/**
 * Mastermind Group — Session Microsite
 *
 * Drop exported session folders into /sessions and they appear automatically.
 * Clean URLs: /session-slug loads that session inline.
 */

// Optional: Better Stack logging (requires `composer install`)
$logger = null;
$autoload = __DIR__ . '/vendor/autoload.php';
if (file_exists($autoload)) {
    require $autoload;

    // Load .env if present
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->safeLoad();

    $sourceToken = $_ENV['BETTERSTACK_SOURCE_TOKEN'] ?? '';
    $ingestingHost = $_ENV['BETTERSTACK_INGESTING_HOST'] ?? '';
    if ($sourceToken && $ingestingHost) {
        $logger = new Monolog\Logger('mastermind-microsite');
        $handler = Logtail\Monolog\LogtailHandlerBuilder::withSourceToken($sourceToken)
            ->withEndpoint('https://' . $ingestingHost)
            ->build();
        $logger->pushHandler($handler);
    }
}

$baseDir = __DIR__;
$sessionsDir = $baseDir . '/sessions';

// --- Scan sessions -----------------------------------------------------------

function scanSessions(string $dir): array {
    $sessions = [];
    if (!is_dir($dir)) return $sessions;

    foreach (scandir($dir) as $folder) {
        if ($folder[0] === '.') continue;
        $path = $dir . '/' . $folder;
        $htmlFile = $path . '/index.html';
        if (!is_dir($path) || !file_exists($htmlFile)) continue;

        $html = file_get_contents($htmlFile);
        $title = $folder; // fallback
        $topic = '';
        $date = '';

        // Extract title from <title> tag (strip " — Mastermind Group" suffix)
        if (preg_match('/<title>(.+?)<\/title>/', $html, $m)) {
            $title = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
            $title = preg_replace('/\s*[\x{2014}\x{2013}\-]\s*Mastermind Group$/u', '', $title);
        }

        // Extract topic from thread-topic span
        if (preg_match('/<span class="thread-topic">(.+?)<\/span>/', $html, $m)) {
            $topic = html_entity_decode($m[1], ENT_QUOTES, 'UTF-8');
        }

        // Extract date from thread-meta (the span after the first meta-separator)
        if (preg_match_all('/<span class="meta-separator">·<\/span>\s*<span>(.+?)<\/span>/', $html, $m)) {
            if (!empty($m[1][0])) {
                $date = html_entity_decode($m[1][0], ENT_QUOTES, 'UTF-8');
            }
        }

        // Extract participant names from footer list
        $participants = [];
        if (preg_match_all('/<li>([^<]+)\s*<span class="participant-model">/', $html, $m)) {
            $participants = array_map('trim', $m[1]);
        }

        // Extract avatars from header-avatars div
        $avatars = [];
        if (preg_match('/<div class="header-avatars">(.*?)<\/div>/s', $html, $m)) {
            $avatarBlock = $m[1];
            // Image avatars: <img src="avatars/file" alt="Name" title="Name" />
            if (preg_match_all('/<img\s+src="avatars\/([^"]+)"\s+alt="([^"]*)"/', $avatarBlock, $am)) {
                foreach ($am[1] as $i => $file) {
                    $avatars[] = ['type' => 'img', 'file' => $file, 'name' => html_entity_decode($am[2][$i], ENT_QUOTES, 'UTF-8')];
                }
            }
            // Placeholder avatars: <div class="avatar-placeholder" title="Name">XX</div>
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

    // Sort by date descending (newest first), falling back to title
    usort($sessions, function ($a, $b) {
        return strcmp($b['date'], $a['date']) ?: strcmp($a['title'], $b['title']);
    });

    return $sessions;
}

$sessions = scanSessions($sessionsDir);

// --- Routing -----------------------------------------------------------------

$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip base path if site is in a subdirectory
$scriptDir = dirname($_SERVER['SCRIPT_NAME']);
if ($scriptDir !== '/' && str_starts_with($requestUri, $scriptDir)) {
    $requestUri = substr($requestUri, strlen($scriptDir));
}
$requestUri = '/' . trim($requestUri, '/');

$activeSlug = null;
$activeSession = null;

// Support both clean URLs (/session-slug) and query param fallback (?s=session-slug)
$slug = null;
if ($requestUri !== '/' && $requestUri !== '') {
    $slug = trim($requestUri, '/');
} elseif (!empty($_GET['s'])) {
    $slug = $_GET['s'];
}

$isAboutPage = ($slug === 'about');

if ($slug !== null && !$isAboutPage) {
    foreach ($sessions as $s) {
        if ($s['slug'] === $slug) {
            $activeSlug = $slug;
            $activeSession = $s;
            break;
        }
    }
    // 404 if slug doesn't match any session
    if ($activeSlug === null) {
        http_response_code(404);
        $logger?->warning('404 Not Found', ['slug' => $slug, 'uri' => $_SERVER['REQUEST_URI']]);
    }
}

$logger?->info('Page view', [
    'path' => $requestUri,
    'slug' => $activeSlug,
    'status' => http_response_code(),
]);

// --- Site configuration (edit these) -----------------------------------------

$siteTitle = 'Mastermind Group Debatter';
$siteDescription = 'En samling af AI-drevne rundbordsdiskussioner, hvor syntetiske personaer debatterer og udforsker emner. <a href="/about">Lær mere</a>';

// --- Compute base path (supports subdirectory installs) ----------------------

$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';

// --- Render ------------------------------------------------------------------
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base href="<?= htmlspecialchars($basePath) ?>">
<title><?= $activeSession ? htmlspecialchars($activeSession['title']) . ' — ' : ($isAboutPage ? 'Om — ' : '') ?><?= htmlspecialchars($siteTitle) ?></title>
<meta name="description" content="<?= htmlspecialchars($activeSession ? $activeSession['topic'] : strip_tags($siteDescription)) ?>">
<link rel="icon" href="assets/logomark.png" type="image/png">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="./" class="logo-link">
      <img src="assets/logotype-wide.png" alt="Mastermind Group" class="logo">
    </a>
  </div>
  <nav class="session-nav">
    <div class="nav-label">Debatter</div>
    <?php if (empty($sessions)): ?>
      <div class="nav-empty">Ingen debatter fundet.</div>
    <?php else: ?>
      <?php foreach ($sessions as $s): ?>
        <a href="<?= htmlspecialchars($s['slug']) ?>"
           class="nav-item<?= $activeSlug === $s['slug'] ? ' active' : '' ?>"
           title="<?= htmlspecialchars($s['topic']) ?>">
          <span class="nav-title"><?= htmlspecialchars($s['title']) ?></span>
          <?php if ($s['date']): ?>
            <span class="nav-date"><?= htmlspecialchars($s['date']) ?></span>
          <?php endif; ?>
        </a>
      <?php endforeach; ?>
    <?php endif; ?>
  </nav>
</aside>

<div class="sidebar-overlay" id="sidebarOverlay"></div>

<button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle menu">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect y="3" width="20" height="2" rx="1" fill="currentColor"/>
    <rect y="9" width="20" height="2" rx="1" fill="currentColor"/>
    <rect y="15" width="20" height="2" rx="1" fill="currentColor"/>
  </svg>
</button>

<main class="content" id="content">
  <?php if ($activeSession): ?>
    <iframe
      src="sessions/<?= htmlspecialchars($activeSlug) ?>/index.html"
      class="session-frame"
      id="sessionFrame"
      title="<?= htmlspecialchars($activeSession['title']) ?>"
    ></iframe>
  <?php elseif ($isAboutPage): ?>
    <div class="about-page">
      <img src="assets/logotype.png" alt="Mastermind Group" class="about-logo">

      <h1>Om Mastermind Group</h1>

      <p><em>Tænk hvis hvis du havde verdens mest succesfulde erhvervsledere på speed dial?</em></p>

      <p>Forestil dig at sparre om din forretningsstrategi med Jeff Bezos, Tim Cook, Jensen Huang, Steve Jobs, Elon Musk, Satya Nadella, Mark Zuckerberg og Jack Ma Yun &mdash; med et øjebliks varsel.</p>

      <p>Eller at være fluen på væggen under en passioneret debat mellem Sam Altman, Yoshua Bengio, Leo Feng, Demis Hassabis, Geoffrey Hinton, Yann LeCun og Ilya Sutskever om vejen til kunstig generel intelligens.</p>

      <p>Eller at få Margaret Atwood, John Steinbeck og Virginia Woolf til at gennemgå dit ufærdige manuskript og hjælpe dig med at lande slutningen.</p>

      <p>Konceptet <em>mastermind group</em> &mdash; opfundet af Napoleon Hill &mdash; er en lille, peer-to-peer mentorgruppe, hvor ligesindede mødes regelmæssigt for at udveksle ideer, udfordre antagelser og holde hinanden ansvarlige. Ideen er enkel: kollektiv intelligens accelererer det, ingen enkelt hjerne kan gøre alene. <strong>Mastermind Group</strong> tager dette koncept og fjerner den største begrænsning &mdash; <em>hvem</em> der får lov at sidde med ved bordet.</p>

      <p>Opret AI-ekspertpersonaer &mdash; hver drevet af en separat sprogmodel via <a href="https://openrouter.ai" target="_blank" rel="noopener">OpenRouter</a> &mdash; og sæt dem løs i strukturerede, autonome rundbordsdiskussioner om ethvert emne. Følg samtalen i realtid, bryd ind som moderator, anmod om en opsummering, eller forlæng debatten.</p>

      <h2>Funktioner</h2>
      <ul>
        <li><strong>Brugerdefinerede ekspertpersonaer</strong> &mdash; Opret navngivne AI-eksperter med biografier, avatarer og individuelt tildelte sprogmodeller</li>
        <li><strong>Autonome rundbordsdiskussioner</strong> &mdash; Diskussioner kører serverside, uanset om browseren er åben eller ej</li>
        <li><strong>Streaming i realtid</strong> &mdash; Følg samtalen live via WebSockets</li>
        <li><strong>Moderatorkontroller</strong> &mdash; Bryd ind med opfølgende spørgsmål, anmod om opsummering, forlæng runder, eller pause/genoptag</li>
        <li><strong>AI-genererede opsummeringer</strong> &mdash; Struktureret afrunding med konsensus, uenigheder, nøgleindsigter og anbefalinger</li>
        <li><strong>Modelagnostisk</strong> &mdash; Mix og match alle modeller tilgængelige på OpenRouter</li>
        <li><strong>Self-hosted</strong> &mdash; Kører på en enkelt Node.js-server med SQLite</li>
      </ul>

      <p>Mastermind Group er open source. <a href="https://github.com/JensRoland/mastermind-group" target="_blank" rel="noopener">Se kildekoden på GitHub</a>.</p>

      <div class="about-disclaimer">
        <h2>Vigtig ansvarsfraskrivelse</h2>
        <p>Alle debatter og diskussioner på denne side er genereret af kunstig intelligens. Indholdet er <strong>probabilistiske simuleringer</strong> &mdash; ikke autentiske udtalelser fra de personer, eksperterne er baseret på.</p>
        <p>Ekspertpersonaerne er fiktive konstruktioner skabt ved hjælp af sprogmodeller, som har internaliseret offentligt tilgængeligt materiale. Deres udsagn afspejler statistiske mønstre i træningsdata og er <strong>ikke</strong> udtryk for de virkelige personers faktiske holdninger, meninger eller anbefalinger.</p>
        <p>Indholdet er udelukkende til underholdnings- og inspirationsformål og bør ikke danne grundlag for konkrete beslutninger.</p>
      </div>
    </div>
  <?php elseif (http_response_code() === 404): ?>
    <div class="landing">
      <img src="assets/logomark.png" alt="" class="landing-logo">
      <h1>Debat ikke fundet</h1>
      <p>Debatten findes ikke. Vælg en anden i menuen til venstre eller <a href="./">gå tilbage til hovedsiden</a>.</p>
    </div>
  <?php else: ?>
    <div class="landing">
      <img src="assets/logomark.png" alt="" class="landing-logo">
      <h1><?= htmlspecialchars($siteTitle) ?></h1>
      <p class="landing-description"><?= $siteDescription ?></p>
      <?php if (!empty($sessions)): ?>
        <div class="session-cards">
          <?php foreach ($sessions as $s): ?>
            <a href="<?= htmlspecialchars($s['slug']) ?>" class="session-card">
              <?php if (!empty($s['avatars'])): ?>
                <span class="card-avatars">
                  <?php foreach ($s['avatars'] as $av): ?>
                    <?php if ($av['type'] === 'img'): ?>
                      <img src="sessions/<?= htmlspecialchars($s['slug']) ?>/avatars/<?= htmlspecialchars($av['file']) ?>" alt="<?= htmlspecialchars($av['name']) ?>" title="<?= htmlspecialchars($av['name']) ?>">
                    <?php else: ?>
                      <span class="card-avatar-placeholder" title="<?= htmlspecialchars($av['name']) ?>"><?= htmlspecialchars($av['initials']) ?></span>
                    <?php endif; ?>
                  <?php endforeach; ?>
                </span>
              <?php endif; ?>
              <span class="card-text">
                <span class="card-title"><?= htmlspecialchars($s['title']) ?></span>
                <?php if ($s['topic']): ?>
                  <span class="card-topic"><?= htmlspecialchars($s['topic']) ?></span>
                <?php endif; ?>
                <?php if (!empty($s['participants'])): ?>
                  <span class="card-participants"><?= htmlspecialchars(implode(', ', $s['participants'])) ?></span>
                <?php endif; ?>
                <?php if ($s['date']): ?>
                  <span class="card-date"><?= htmlspecialchars($s['date']) ?></span>
                <?php endif; ?>
              </span>
            </a>
          <?php endforeach; ?>
        </div>
      <?php else: ?>
        <p class="landing-empty">Ingen debatter fundet.</p>
      <?php endif; ?>
    </div>
  <?php endif; ?>
</main>

<script>
// Sidebar toggle for mobile
const toggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

toggle.addEventListener('click', () => {
  const opening = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active', opening);
});

overlay.addEventListener('click', closeSidebar);

// Close sidebar when clicking outside on mobile (non-iframe pages)
document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !toggle.contains(e.target)) {
    closeSidebar();
  }
});

// On mobile, inject top margin into iframe header so hamburger doesn't overlap
const frame = document.getElementById('sessionFrame');
if (frame && window.matchMedia('(max-width: 768px)').matches) {
  frame.addEventListener('load', () => {
    try {
      const style = frame.contentDocument.createElement('style');
      style.textContent = '.thread-header { margin-top: 48px; }';
      frame.contentDocument.head.appendChild(style);
    } catch (e) { /* cross-origin fallback: do nothing */ }
  });
}
</script>
</body>
</html>
