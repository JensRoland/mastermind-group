<?php
/**
 * API: Vote toggling.
 *
 * POST /api/votes/{topicId} — Toggle vote on a topic (requires auth)
 */

require_once __DIR__ . '/../auth.php';

$user = requireAuth();

// Extract topic ID from route: /api/votes/{id}
$path = getRoutePath();
if (!preg_match('#^/api/votes/(\d+)$#', $path, $m)) {
    jsonResponse(['error' => 'Ugyldigt emne-ID.'], 400);
}
$topicId = (int) $m[1];

// Check topic exists
$stmt = $db->prepare('SELECT id FROM topics WHERE id = ?');
$stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
if (!$stmt->execute()->fetchArray()) {
    jsonResponse(['error' => 'Emneforslaget blev ikke fundet.'], 404);
}

// Toggle vote in a transaction
$db->exec('BEGIN');
try {
    // Check if already voted
    $stmt = $db->prepare('SELECT 1 FROM votes WHERE topic_id = ? AND clerk_user_id = ?');
    $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
    $stmt->bindValue(2, $user['user_id'], SQLITE3_TEXT);
    $alreadyVoted = (bool) $stmt->execute()->fetchArray();

    if ($alreadyVoted) {
        $stmt = $db->prepare('DELETE FROM votes WHERE topic_id = ? AND clerk_user_id = ?');
        $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
        $stmt->bindValue(2, $user['user_id'], SQLITE3_TEXT);
        $stmt->execute();

        $stmt = $db->prepare('UPDATE topics SET vote_count = vote_count - 1 WHERE id = ?');
        $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
        $stmt->execute();
    } else {
        $stmt = $db->prepare('INSERT INTO votes (topic_id, clerk_user_id) VALUES (?, ?)');
        $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
        $stmt->bindValue(2, $user['user_id'], SQLITE3_TEXT);
        $stmt->execute();

        $stmt = $db->prepare('UPDATE topics SET vote_count = vote_count + 1 WHERE id = ?');
        $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
        $stmt->execute();
    }

    $db->exec('COMMIT');
} catch (\Exception $e) {
    $db->exec('ROLLBACK');
    jsonResponse(['error' => 'Der opstod en fejl. Prøv igen.'], 500);
}

// Return updated state
$stmt = $db->prepare('SELECT vote_count FROM topics WHERE id = ?');
$stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
$voteCount = $stmt->execute()->fetchArray(SQLITE3_ASSOC)['vote_count'];

jsonResponse([
    'voted' => !$alreadyVoted,
    'vote_count' => $voteCount,
]);
