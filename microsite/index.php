<?php
/**
 * Mastermind Group — Session Microsite
 *
 * Drop exported session folders into /sessions and they appear automatically.
 * Reads session.json for metadata and partial.html for inline content.
 * Falls back to HTML parsing / iframe for legacy exports.
 */

// Start session for tracking (used in logging)
session_start();

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

function getInitials(string $name): string {
    $words = preg_split('/\s+/', trim($name));
    $initials = '';
    foreach ($words as $w) {
        if ($w !== '') $initials .= mb_strtoupper(mb_substr($w, 0, 1));
    }
    return mb_substr($initials, 0, 2) ?: '?';
}

function scanSessions(string $dir): array {
    $sessions = [];
    if (!is_dir($dir)) return $sessions;

    foreach (scandir($dir) as $folder) {
        if ($folder[0] === '.') continue;
        $path = $dir . '/' . $folder;
        if (!is_dir($path)) continue;

        $jsonFile = $path . '/session.json';
        $hasPartial = file_exists($path . '/partial.html');
        $hasIndex = file_exists($path . '/index.html');

        if (!$hasPartial && !$hasIndex) continue;

        $session = null;

        // Primary: read session.json
        if (file_exists($jsonFile)) {
            $json = json_decode(file_get_contents($jsonFile), true);
            if ($json) {
                $session = [
                    'slug' => $folder,
                    'title' => $json['title'] ?? $folder,
                    'topic' => $json['topic'] ?? '',
                    'date' => $json['dateFormatted'] ?? '',
                    'dateRaw' => $json['date'] ?? '',
                    'turns' => $json['turns'] ?? 0,
                    'language' => $json['language'] ?? 'en',
                    'disclaimerLabel' => $json['disclaimerLabel'] ?? '',
                    'disclaimer' => $json['disclaimer'] ?? '',
                    'credit' => $json['credit'] ?? '',
                    'participants' => [],
                    'avatars' => [],
                    'hasPartial' => $hasPartial,
                ];
                foreach ($json['participants'] ?? [] as $p) {
                    $session['participants'][] = $p['name'] ?? '';
                    if (!empty($p['avatarFile'])) {
                        $session['avatars'][] = ['type' => 'img', 'file' => $p['avatarFile'], 'name' => $p['name'] ?? ''];
                    } else {
                        $session['avatars'][] = ['type' => 'placeholder', 'initials' => getInitials($p['name'] ?? ''), 'name' => $p['name'] ?? ''];
                    }
                }
            }
        }

        // Fallback: parse index.html (legacy exports without session.json)
        if (!$session && $hasIndex) {
            $html = file_get_contents($path . '/index.html');
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

            $session = [
                'slug' => $folder,
                'title' => $title,
                'topic' => $topic,
                'date' => $date,
                'dateRaw' => '',
                'turns' => 0,
                'language' => 'en',
                'disclaimerLabel' => '',
                'disclaimer' => '',
                'credit' => '',
                'participants' => $participants,
                'avatars' => $avatars,
                'hasPartial' => $hasPartial,
            ];
        }

        if ($session) $sessions[] = $session;
    }

    // Sort by date descending (newest first), falling back to title
    usort($sessions, function ($a, $b) {
        $cmp = strcmp($b['dateRaw'] ?: $b['date'], $a['dateRaw'] ?: $a['date']);
        return $cmp ?: strcmp($a['title'], $b['title']);
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
    }
}

// Skip logging for bots/crawlers
$isBot = preg_match('/bot|crawler|okhttp|spider|index|headless|facebook|bing|python|nessus|curl|http\.rb/i', $_SERVER['HTTP_USER_AGENT'] ?? '');

if (!$isBot) {
    if (http_response_code() === 404) {
        $logger?->warning('404 Not Found', [
            'slug' => $slug,
            'uri' => $_SERVER['REQUEST_URI'],
            'ip' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'session_id' => session_id() ?: null,
        ]);
    }

    $logger?->info('Page view', [
        'path' => $requestUri,
        'slug' => $activeSlug,
        'status' => http_response_code(),
        'ip' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
        'ua' => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'session_id' => session_id() ?: null,
    ]);
}

// --- Site configuration (edit these) -----------------------------------------

$siteTitle = 'AI-Debatten';
$siteDescription = 'En samling af AI-drevne rundbordsdiskussioner, hvor syntetiske personaer debatterer og udforsker emner. <a href="/about">Lær mere</a>';
$siteUrl = 'https://ai-debatten.dk';

// --- OpenGraph metadata ------------------------------------------------------

$ogTitle = $siteTitle;
$ogDescription = strip_tags($siteDescription);
$ogImage = $siteUrl . '/assets/og-default.webp';
$ogUrl = $siteUrl . $requestUri;

if ($activeSession) {
    $ogTitle = $activeSession['title'] . ' — ' . $siteTitle;
    $ogDescription = $activeSession['topic'];
    // Use session-specific OG image if it exists, otherwise fall back to default
    $sessionOgImage = $sessionsDir . '/' . $activeSlug . '/og-image.webp';
    if (file_exists($sessionOgImage)) {
        $ogImage = $siteUrl . '/sessions/' . $activeSlug . '/og-image.webp';
    }
} elseif ($isAboutPage) {
    $ogTitle = 'Om — ' . $siteTitle;
}

// --- Compute base path (supports subdirectory installs) ----------------------

$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';

// --- Render ------------------------------------------------------------------
?>
<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base href="<?= htmlspecialchars($basePath) ?>">
<title><?= htmlspecialchars($ogTitle) ?></title>
<meta name="description" content="<?= htmlspecialchars($ogDescription) ?>">
<!-- OpenGraph -->
<meta property="og:type" content="<?= $activeSession ? 'article' : 'website' ?>">
<meta property="og:title" content="<?= htmlspecialchars($ogTitle) ?>">
<meta property="og:description" content="<?= htmlspecialchars($ogDescription) ?>">
<meta property="og:image" content="<?= htmlspecialchars($ogImage) ?>">
<meta property="og:url" content="<?= htmlspecialchars($ogUrl) ?>">
<meta property="og:site_name" content="<?= htmlspecialchars($siteTitle) ?>">
<!-- Twitter/X Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= htmlspecialchars($ogTitle) ?>">
<meta name="twitter:description" content="<?= htmlspecialchars($ogDescription) ?>">
<meta name="twitter:image" content="<?= htmlspecialchars($ogImage) ?>">
<link rel="icon" href="assets/logomark-classy.webp" type="image/webp">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;1,8..60,300;1,8..60,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="./" class="logo-link">
      <img src="assets/logomark-classy.webp" alt="" class="logo-mark">
      <span class="logo-title">AI-DEBATTEN</span>
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
    <div class="session-content">
      <header class="thread-header">
        <?php if ($activeSession['date']): ?>
          <div class="thread-dateline"><?= htmlspecialchars($activeSession['date']) ?><?php if ($activeSession['turns']): ?> &middot; <?= (int)$activeSession['turns'] ?> ture<?php endif; ?></div>
        <?php endif; ?>
        <h1><?= htmlspecialchars($activeSession['title']) ?></h1>
        <?php if ($activeSession['topic']): ?>
          <p class="thread-deck"><?= htmlspecialchars($activeSession['topic']) ?></p>
        <?php endif; ?>
        <?php if (!empty($activeSession['avatars'])): ?>
          <div class="thread-byline">
            <?php foreach ($activeSession['avatars'] as $av): ?>
              <span class="byline-contributor">
                <?php if ($av['type'] === 'img'): ?>
                  <img src="sessions/<?= htmlspecialchars($activeSlug) ?>/avatars/<?= htmlspecialchars($av['file']) ?>" alt="<?= htmlspecialchars($av['name']) ?>">
                <?php else: ?>
                  <span class="byline-placeholder"><?= htmlspecialchars($av['initials']) ?></span>
                <?php endif; ?>
                <span class="byline-name"><?= htmlspecialchars($av['name']) ?></span>
              </span>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
        <?php if ($activeSession['disclaimer']): ?>
          <div class="disclaimer">
            <?php if ($activeSession['disclaimerLabel']): ?>
              <strong><?= htmlspecialchars($activeSession['disclaimerLabel']) ?>:</strong>
            <?php endif; ?>
            <?= htmlspecialchars($activeSession['disclaimer']) ?>
          </div>
        <?php endif; ?>
      </header>

      <?php
      $partialFile = $sessionsDir . '/' . $activeSlug . '/partial.html';
      if (file_exists($partialFile)):
          // Rewrite relative avatar paths to point to the session folder
          $partial = file_get_contents($partialFile);
          $partial = str_replace('src="avatars/', 'src="sessions/' . htmlspecialchars($activeSlug) . '/avatars/', $partial);
          echo $partial;
      else:
          // Legacy fallback: iframe for old exports without partial.html
      ?>
        <iframe
          src="sessions/<?= htmlspecialchars($activeSlug) ?>/index.html"
          class="session-frame"
          title="<?= htmlspecialchars($activeSession['title']) ?>"
        ></iframe>
      <?php endif; ?>
    </div>
  <?php elseif ($isAboutPage): ?>
    <div class="about-page">
      <div class="about-logo-block">
        <img src="assets/logomark-classy.webp" alt="" class="about-logo">
        <h2 class="about-logo-title">AI-DEBATTEN</h2>
      </div>

      <h1>Om AI-Debatten</h1>

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
      <div class="landing-logo-block">
        <img src="assets/logomark-classy.webp" alt="" class="landing-logo">
        <h2 class="landing-logo-title">AI-DEBATTEN</h2>
      </div>
      <h1>Debat ikke fundet</h1>
      <p>Debatten findes ikke. Vælg en anden i menuen til venstre eller <a href="./">gå tilbage til hovedsiden</a>.</p>
    </div>
  <?php else: ?>
    <div class="landing">
      <div class="landing-logo-block">
        <img src="assets/logomark-classy.webp" alt="" class="landing-logo">
        <h2 class="landing-logo-title">AI-DEBATTEN</h2>
      </div>
      <h1><?= htmlspecialchars($siteTitle) ?></h1>
      <p class="landing-description"><?= $siteDescription ?></p>
      <?php if (!empty($sessions)): ?>
        <div class="article-list">
          <?php foreach ($sessions as $s): ?>
            <a href="<?= htmlspecialchars($s['slug']) ?>" class="article-item">
              <span class="article-title"><?= htmlspecialchars($s['title']) ?></span>
              <?php if ($s['topic']): ?>
                <span class="article-deck"><?= htmlspecialchars($s['topic']) ?></span>
              <?php endif; ?>
              <span class="article-meta">
                <?php if (!empty($s['participants'])): ?>
                  <span class="article-byline"><?= htmlspecialchars(implode(', ', $s['participants'])) ?></span>
                <?php endif; ?>
                <?php if ($s['date']): ?>
                  <span class="article-date"><?= htmlspecialchars($s['date']) ?></span>
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

document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !toggle.contains(e.target)) {
    closeSidebar();
  }
});
</script>
</body>
</html>
