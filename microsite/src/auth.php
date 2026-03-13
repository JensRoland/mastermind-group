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

    // Derive JWKS URL from publishable key (pk_test_xxx or pk_live_xxx)
    // Clerk's Frontend API domain is embedded in the publishable key (base64 after the prefix)
    $pubKey = $_ENV['CLERK_PUBLISHABLE_KEY'] ?? '';
    $parts = explode('_', $pubKey, 3);
    $frontendApi = '';
    if (count($parts) === 3) {
        $frontendApi = rtrim(base64_decode($parts[2]), '$');
    }

    if (!$frontendApi) {
        return [];
    }

    $jwksUrl = 'https://' . $frontendApi . '/.well-known/jwks.json';
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
