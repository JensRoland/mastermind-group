<?php
/**
 * Mastermind Group — Session Microsite
 *
 * Front controller: routing only. All logic lives in src/.
 */

require __DIR__ . '/src/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = getRoutePath();
$basePath = getBasePath();

// --- API routes (JSON) -------------------------------------------------------

if (str_starts_with($path, '/api/')) {
    if ($method === 'POST' && $path === '/api/topics') {
        require __DIR__ . '/src/api/topics.php';
        exit;
    }
    if ($method === 'DELETE' && preg_match('#^/api/topics/\d+$#', $path)) {
        require __DIR__ . '/src/api/topics.php';
        exit;
    }
    if ($method === 'POST' && preg_match('#^/api/votes/\d+$#', $path)) {
        require __DIR__ . '/src/api/votes.php';
        exit;
    }
    jsonResponse(['error' => 'Not found'], 404);
}

// --- Page routes (HTML) ------------------------------------------------------

$sessions = scanSessions($sessionsDir);

// Determine which page to render
$slug = ($path !== '/') ? trim($path, '/') : ($_GET['s'] ?? null);
$isAboutPage = ($slug === 'about');
$isForslagPage = ($slug === 'forslag');
$activeSlug = null;
$activeSession = null;

if ($slug && !$isAboutPage && !$isForslagPage) {
    $activeSession = findSession($slug, $sessions);
    if ($activeSession) {
        $activeSlug = $slug;
    }
    if (!$activeSession) {
        http_response_code(404);
        $logger?->warning('404 Not Found', [
            'slug' => $slug,
            'uri' => $_SERVER['REQUEST_URI'],
            'ip' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
            'session_id' => session_id() ?: null,
        ]);
    }
}

// Determine page title
$pageTitle = $siteTitle;
if ($activeSession) {
    $pageTitle = htmlspecialchars($activeSession['title']) . ' — ' . $siteTitle;
} elseif ($isAboutPage) {
    $pageTitle = 'Om — ' . $siteTitle;
} elseif ($isForslagPage) {
    $pageTitle = 'Emneforslag — ' . $siteTitle;
}

$pageDescription = $activeSession
    ? htmlspecialchars($activeSession['topic'])
    : htmlspecialchars(strip_tags($siteDescription));

// --- OpenGraph metadata ------------------------------------------------------

$ogTitle = $siteTitle;
$ogDescription = strip_tags($siteDescription);
$ogImage = $siteUrl . '/assets/og-default.webp';
$ogUrl = $siteUrl . $path;

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
} elseif ($isForslagPage) {
    $ogTitle = 'Emneforslag — ' . $siteTitle;
    $ogDescription = 'Foreslå emner til fremtidige debatter og stem på andres forslag.';
}

$logger?->info('Page view', [
    'path' => $path,
    'slug' => $activeSlug,
    'status' => http_response_code(),
    'ip' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null,
    'session_id' => session_id() ?: null,
]);

// --- Render ------------------------------------------------------------------
?>
<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<base href="<?= htmlspecialchars($basePath) ?>">
<title><?= $pageTitle ?></title>
<meta name="description" content="<?= htmlspecialchars($ogDescription) ?>">
<!-- OpenGraph -->
<meta property="og:type" content="website">
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
<link rel="icon" href="assets/logomark.png" type="image/png">
<link rel="stylesheet" href="assets/style.css">
</head>
<body data-admin-id="<?= htmlspecialchars($clerkAdminUserId) ?>">

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
    <div class="nav-label" style="margin-top: var(--spacing-md)">Deltag</div>
    <a href="forslag" class="nav-item<?= $isForslagPage ? ' active' : '' ?>" title="Foreslå emner og stem">
      <span class="nav-title">Emneforslag</span>
    </a>
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

<header class="topbar">
  <div id="clerk-user"></div>
</header>

<main class="content" id="content">
  <?php if ($activeSession): ?>
    <?php require __DIR__ . '/src/pages/session.php'; ?>
  <?php elseif ($isAboutPage): ?>
    <?php require __DIR__ . '/src/pages/about.php'; ?>
  <?php elseif ($isForslagPage): ?>
    <?php require __DIR__ . '/src/pages/forslag.php'; ?>
  <?php elseif ($slug && !$activeSession): ?>
    <?php require __DIR__ . '/src/pages/not-found.php'; ?>
  <?php else: ?>
    <?php require __DIR__ . '/src/pages/landing.php'; ?>
  <?php endif; ?>
</main>

<?php if ($clerkPublishableKey && $clerkFapiDomain): ?>
<script
  async
  crossorigin="anonymous"
  data-clerk-publishable-key="<?= htmlspecialchars($clerkPublishableKey) ?>"
  src="https://<?= htmlspecialchars($clerkFapiDomain) ?>/npm/@clerk/clerk-js@5/dist/clerk.browser.js"
  type="text/javascript"
></script>
<?php endif; ?>
<script src="assets/app.js"></script>
</body>
</html>
