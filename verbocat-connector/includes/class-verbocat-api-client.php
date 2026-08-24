<?php
/**
 * Verbocat API Client for HTTP Communications
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Api_Client {

    /**
     * Send items or structured content to Verbocat POST /api/v1/translate
     *
     * @param array  $payload     Array containing items/text, source_lang, target_langs
     * @param string $api_url     Optional custom API URL
     * @param string $api_key     Optional custom API Key
     * @return array|WP_Error
     */
    public static function translate($payload, $api_url = null, $api_key = null) {
        $opts = Verbocat_Settings::get_options();
        $url = $api_url ?: $opts['api_url'];
        $key = $api_key ?: $opts['api_key'];

        if (empty($key)) {
            return new WP_Error(
                'missing_api_key',
                __('Verbocat API key is missing. Please configure it in Settings > Verbocat Localization.', 'verbocat-connector')
            );
        }

        $endpoint = rtrim($url, '/') . '/translate';

        $response = wp_remote_post($endpoint, [
            'headers' => [
                'Content-Type' => 'application/json',
                'x-api-key'    => $key
            ],
            'body'    => wp_json_encode($payload),
            'timeout' => 90
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $json = json_decode($body, true);

        if ($code !== 200 || empty($json['success'])) {
            $msg = $json['error'] ?? sprintf(__('Verbocat API returned HTTP %d error.', 'verbocat-connector'), $code);
            return new WP_Error('api_error', $msg);
        }

        return $json;
    }

    /**
     * Check API Key status, organization workspace, and remaining credit quota
     *
     * @param string $api_url Optional custom API URL
     * @param string $api_key Optional custom API Key
     * @return array|WP_Error
     */
    public static function check_account($api_url = null, $api_key = null) {
        $opts = Verbocat_Settings::get_options();
        $url = $api_url ?: $opts['api_url'];
        $key = $api_key ?: $opts['api_key'];

        if (empty($key)) {
            return new WP_Error('missing_api_key', __('Please enter an API key first.', 'verbocat-connector'));
        }

        $endpoint = rtrim($url, '/') . '/account';

        $response = wp_remote_get($endpoint, [
            'headers' => [
                'x-api-key' => $key
            ],
            'timeout' => 15
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $json = json_decode($body, true);

        if ($code !== 200 || empty($json['success'])) {
            $msg = $json['error'] ?? sprintf(__('API returned HTTP %d error.', 'verbocat-connector'), $code);
            return new WP_Error('api_error', $msg);
        }

        return $json;
    }

    /**
     * Check API server health
     */
    public static function check_health($api_url = null) {
        $opts = Verbocat_Settings::get_options();
        $url = $api_url ?: $opts['api_url'];
        $endpoint = rtrim($url, '/') . '/health';

        $response = wp_remote_get($endpoint, ['timeout' => 10]);
        if (is_wp_error($response)) return false;

        $code = wp_remote_retrieve_response_code($response);
        return $code === 200;
    }
}
