<?php
/**
 * Clerk JWT verification via JWKS.
 */

use Firebase\JWT\JWT;
use Firebase\JWT\JWK;

function getClerkJWKS(): array {
    $cacheFile = dirname(__DIR__) . '/data/clerk-jwks-cache.json';
    $cacheTTL = 3600; // 1 hour

    if (file_exists($cacheFile)) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if ($cached && ($cached['fetched_at'] ?? 0) > time() - $cacheTTL) {
            return $cached['keys'];
        }
    }

    // Use the FAPI domain derived in bootstrap.php
    global $clerkFapiDomain;
    if (!$clerkFapiDomain) {
        return [];
    }

    $jwksUrl = 'https://' . $clerkFapiDomain . '/.well-known/jwks.json';
    $ctx = stream_context_create(['http' => ['timeout' => 5]]);
    $jwksJson = @file_get_contents($jwksUrl, false, $ctx);
    if (!$jwksJson) return [];

    $jwks = json_decode($jwksJson, true);
    if (!$jwks || empty($jwks['keys'])) return [];

    // Cache to file
    @file_put_contents($cacheFile, json_encode([
        'fetched_at' => time(),
        'keys' => $jwks,
    ]));

    return $jwks;
}

function getAuthenticatedUser(): ?array {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!str_starts_with($authHeader, 'Bearer ')) return null;
    $token = substr($authHeader, 7);

    if (!$token) return null;

    try {
        $jwks = getClerkJWKS();
        if (empty($jwks)) return null;

        $decoded = JWT::decode($token, JWK::parseKeySet($jwks));

        return [
            'user_id' => $decoded->sub,
            'name' => $decoded->name
                ?? $decoded->first_name
                ?? $decoded->username
                ?? 'Anonym',
        ];
    } catch (\Exception $e) {
        return null;
    }
}

function requireAuth(): array {
    $user = getAuthenticatedUser();
    if (!$user) {
        jsonResponse(['error' => 'Log ind for at fortsætte'], 401);
    }
    return $user;
}

function isAdmin(string $userId): bool {
    $adminId = $_ENV['CLERK_ADMIN_USER_ID'] ?? '';
    return $adminId !== '' && $userId === $adminId;
}
