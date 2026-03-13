<?php
/**
 * Session viewer — iframe embed of exported HTML.
 */
?>
<iframe
  src="sessions/<?= htmlspecialchars($activeSlug) ?>/index.html"
  class="session-frame"
  id="sessionFrame"
  title="<?= htmlspecialchars($activeSession['title']) ?>"
></iframe>
