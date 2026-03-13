<?php
/**
 * Landing page — session cards + compact topic list.
 */

$topTopics = getTopics($db, 5);
?>
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

  <?php if (!empty($topTopics)): ?>
    <div class="topic-section">
      <div class="topic-section-header">
        <h2>Emneforslag</h2>
        <a href="forslag" class="topic-see-all">Se alle &amp; foreslå</a>
      </div>
      <div class="topic-list topic-list--compact">
        <?php foreach ($topTopics as $t): ?>
          <div class="topic-card" data-topic-id="<?= $t['id'] ?>">
            <button class="topic-vote-btn<?= $t['user_voted'] ? ' voted' : '' ?>"
                    data-topic-id="<?= $t['id'] ?>"
                    title="Stem på dette emne">
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none"><path d="M6 0L11.196 7.5H0.804L6 0Z" fill="currentColor"/></svg>
              <span class="vote-count"><?= $t['vote_count'] ?></span>
            </button>
            <div class="topic-content">
              <p class="topic-body"><?= htmlspecialchars($t['body']) ?></p>
              <span class="topic-meta"><?= htmlspecialchars($t['user_display_name']) ?> · <?= relativeTime($t['created_at']) ?></span>
            </div>
          </div>
        <?php endforeach; ?>
      </div>
    </div>
  <?php endif; ?>
</div>
