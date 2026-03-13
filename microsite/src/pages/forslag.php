<?php
/**
 * Full topic list page — submit proposals and vote.
 */

$allTopics = getTopics($db);
$maxLength = (int) ($_ENV['TOPIC_MAX_LENGTH'] ?? 500);
?>
<div class="forslag-page">
  <h1>Emneforslag</h1>
  <p class="forslag-intro">Foreslå emner til fremtidige debatter, og stem på andres forslag.</p>

  <div class="topic-submit" id="topic-submit">
    <div class="topic-submit-login" id="topic-submit-login">
      <p>Log ind for at foreslå et emne eller stemme.</p>
    </div>
    <form class="topic-form" id="topic-form" style="display: none;">
      <label for="topic-body" class="topic-form-label">Foreslå et debatemne</label>
      <textarea
        id="topic-body"
        name="body"
        maxlength="<?= $maxLength ?>"
        rows="3"
        placeholder="Beskriv emnet du gerne vil se debatteret..."
      ></textarea>
      <div class="topic-form-footer">
        <span class="char-count"><span id="char-current">0</span>/<?= $maxLength ?></span>
        <button type="submit" class="topic-form-btn" id="topic-submit-btn">Indsend forslag</button>
      </div>
    </form>
  </div>

  <div class="topic-list" id="topic-list">
    <?php if (empty($allTopics)): ?>
      <p class="topic-empty">Ingen emneforslag endnu. Vær den første!</p>
    <?php else: ?>
      <?php foreach ($allTopics as $t): ?>
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
          <button class="topic-delete-btn" data-topic-id="<?= $t['id'] ?>" style="display: none;" title="Slet emneforslag">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3.5h12M5.5 6v4M8.5 6v4M2.5 3.5l.5 8a1 1 0 001 1h6a1 1 0 001-1l.5-8M4.5 3.5v-2a1 1 0 011-1h3a1 1 0 011 1v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      <?php endforeach; ?>
    <?php endif; ?>
  </div>
</div>

<div class="toast" id="toast"></div>
