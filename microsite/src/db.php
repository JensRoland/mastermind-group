<?php
/**
 * SQLite database connection and schema.
 */

function getDatabase(): SQLite3 {
    $dbPath = dirname(__DIR__) . '/data/microsite.sqlite';
    $db = new SQLite3($dbPath);
    $db->busyTimeout(5000);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA foreign_keys = ON');

    // Auto-create schema
    $db->exec('
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clerk_user_id TEXT NOT NULL,
            user_display_name TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\')),
            vote_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS votes (
            topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            clerk_user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\')),
            PRIMARY KEY (topic_id, clerk_user_id)
        );
    ');

    return $db;
}

function getTopics(SQLite3 $db, int $limit = 0, ?string $currentUserId = null): array {
    $sql = 'SELECT id, clerk_user_id, user_display_name, body, created_at, vote_count FROM topics ORDER BY vote_count DESC, created_at DESC';
    if ($limit > 0) {
        $sql .= ' LIMIT ' . $limit;
    }
    $result = $db->query($sql);
    $topics = [];
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $row['user_voted'] = false;
        if ($currentUserId) {
            $stmt = $db->prepare('SELECT 1 FROM votes WHERE topic_id = ? AND clerk_user_id = ?');
            $stmt->bindValue(1, $row['id'], SQLITE3_INTEGER);
            $stmt->bindValue(2, $currentUserId, SQLITE3_TEXT);
            $row['user_voted'] = (bool) $stmt->execute()->fetchArray();
        }
        $topics[] = $row;
    }
    return $topics;
}
