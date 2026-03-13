<?php
/**
 * API: Topic submission and deletion.
 *
 * POST /api/topics — Create a new topic (requires auth)
 * DELETE /api/topics/{id} — Delete a topic (requires admin)
 */

require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../moderation.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $user = requireAuth();
    $input = json_decode(file_get_contents('php://input'), true);
    $body = trim($input['body'] ?? '');

    $maxLength = (int) ($_ENV['TOPIC_MAX_LENGTH'] ?? 500);
    if ($body === '') {
        jsonResponse(['error' => 'Emneforslaget må ikke være tomt.'], 422);
    }
    if (mb_strlen($body) > $maxLength) {
        jsonResponse(['error' => "Emneforslaget må maks. være {$maxLength} tegn."], 422);
    }

    // Rate limit: max N topics per user per day
    $maxPerDay = (int) ($_ENV['TOPIC_MAX_PER_DAY'] ?? 3);
    $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM topics WHERE clerk_user_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')");
    $stmt->bindValue(1, $user['user_id'], SQLITE3_TEXT);
    $count = $stmt->execute()->fetchArray(SQLITE3_ASSOC)['cnt'];
    if ($count >= $maxPerDay) {
        jsonResponse(['error' => "Du kan højst foreslå {$maxPerDay} emner om dagen. Prøv igen i morgen!"], 429);
    }

    // LLM moderation
    $modResult = moderateTopic($body);
    if ($modResult) {
        jsonResponse([
            'error' => $modResult['message'],
            'category' => $modResult['category'],
        ], 422);
    }

    // Insert topic
    $stmt = $db->prepare('INSERT INTO topics (clerk_user_id, user_display_name, body) VALUES (?, ?, ?)');
    $stmt->bindValue(1, $user['user_id'], SQLITE3_TEXT);
    $stmt->bindValue(2, $user['name'], SQLITE3_TEXT);
    $stmt->bindValue(3, $body, SQLITE3_TEXT);
    $stmt->execute();

    $id = $db->lastInsertRowID();
    $stmt = $db->prepare('SELECT * FROM topics WHERE id = ?');
    $stmt->bindValue(1, $id, SQLITE3_INTEGER);
    $topic = $stmt->execute()->fetchArray(SQLITE3_ASSOC);
    $topic['user_voted'] = false;

    jsonResponse($topic, 201);
}

if ($method === 'DELETE') {
    $user = requireAuth();
    if (!isAdmin($user['user_id'])) {
        jsonResponse(['error' => 'Kun administratorer kan slette emneforslag.'], 403);
    }

    // Extract ID from route: /api/topics/{id}
    $path = getRoutePath();
    if (!preg_match('#^/api/topics/(\d+)$#', $path, $m)) {
        jsonResponse(['error' => 'Ugyldigt emne-ID.'], 400);
    }
    $topicId = (int) $m[1];

    $stmt = $db->prepare('DELETE FROM topics WHERE id = ?');
    $stmt->bindValue(1, $topicId, SQLITE3_INTEGER);
    $stmt->execute();

    if ($db->changes() === 0) {
        jsonResponse(['error' => 'Emneforslaget blev ikke fundet.'], 404);
    }

    jsonResponse(null, 204);
}

jsonResponse(['error' => 'Method not allowed'], 405);
