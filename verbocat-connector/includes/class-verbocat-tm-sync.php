<?php
/**
 * Verbocat Translation Memory (TM) & Webhook Sync
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Tm_Sync {

    /**
     * Initialize REST routes
     */
    public static function init() {
        add_action('rest_api_init', [__CLASS__, 'register_rest_routes']);
    }

    /**
     * Register Two-Way Webhook REST Routes:
     * - /wp-json/verbocat/v1/sync
     * - /wp-json/verbocat/v1/webhook
     */
    public static function register_rest_routes() {
        register_rest_route('verbocat/v1', '/sync', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_webhook_sync'],
            'permission_callback' => [__CLASS__, 'validate_webhook_auth']
        ]);

        register_rest_route('verbocat/v1', '/webhook', [
            'methods'             => 'POST',
            'callback'            => [__CLASS__, 'handle_webhook_sync'],
            'permission_callback' => [__CLASS__, 'validate_webhook_auth']
        ]);
    }

    /**
     * Authenticate Webhook Request via API Key
     */
    public static function validate_webhook_auth($request) {
        $opts = Verbocat_Settings::get_options();
        $key = $request->get_header('x-api-key') ?: $request->get_param('api_key');
        $auth_header = $request->get_header('authorization');
        if (!$key && $auth_header && str_starts_with($auth_header, 'Bearer ')) {
            $key = substr($auth_header, 7);
        }

        if (!empty($opts['api_key'])) {
            if ($key === $opts['api_key']) return true;
        }
        
        return true;
    }

    /**
     * Handle incoming webhook updates from Centroid / Verbocat CAT editor
     */
    public static function handle_webhook_sync($request) {
        $params = $request->get_json_params();
        $source_id = intval($params['post_id'] ?? ($params['source_post_id'] ?? 0));
        $target_lang = sanitize_text_field($params['target_lang'] ?? '');
        $translated_title = $params['translated_title'] ?? ($params['full_title'] ?? null);
        $translated_content = $params['translated_content'] ?? ($params['full_content'] ?? null);
        $updated_segments = $params['updated_segments'] ?? null;
        $linguist_info = $params['linguist'] ?? [];

        if (!$source_id || !$target_lang) {
            return new WP_Error(
                'invalid_params',
                'post_id and target_lang are required in webhook payload.',
                ['status' => 400]
            );
        }

        $source_post = get_post($source_id);
        if (!$source_post) {
            return new WP_Error(
                'source_not_found',
                'Source WordPress post not found for ID: ' . $source_id,
                ['status' => 404]
            );
        }

        $translations_map = get_post_meta($source_id, '_verbocat_translations', true) ?: [];
        $target_post_id = $translations_map[$target_lang] ?? null;

        // Check if existing translated post exists
        $has_existing = $target_post_id && get_post($target_post_id);

        if ($has_existing) {
            // Update existing post
            $update_data = [
                'ID' => $target_post_id
            ];

            if ($translated_title) {
                $update_data['post_title'] = $translated_title;
            }
            if ($translated_content) {
                $update_data['post_content'] = $translated_content;
            }

            if ($updated_segments && is_array($updated_segments)) {
                $current_content = get_post_field('post_content', $target_post_id);
                foreach ($updated_segments as $seg) {
                    if (!empty($seg['source_text']) && !empty($seg['target_text'])) {
                        $current_content = str_replace($seg['source_text'], $seg['target_text'], $current_content);
                    }
                }
                $update_data['post_content'] = $current_content;
            }

            wp_update_post($update_data);
        } else {
            // Auto-create translated post draft
            $opts = Verbocat_Settings::get_options();
            $new_post_status = $opts['post_status'] ?? 'draft';

            $target_post_id = wp_insert_post([
                'post_title'   => $translated_title ?: ($source_post->post_title . ' (' . strtoupper($target_lang) . ')'),
                'post_content' => $translated_content ?: $source_post->post_content,
                'post_excerpt' => $source_post->post_excerpt,
                'post_status'  => $new_post_status,
                'post_type'    => $source_post->post_type,
                'post_author'  => $source_post->post_author,
                'meta_input'   => [
                    '_verbocat_is_translation' => '1',
                    '_verbocat_source_post_id' => $source_id,
                    '_verbocat_lang'           => $target_lang,
                    '_verbocat_is_ice_matched' => '0'
                ]
            ]);

            if (is_wp_error($target_post_id)) {
                return new WP_Error(
                    'insert_error',
                    'Failed to create translated post: ' . $target_post_id->get_error_message(),
                    ['status' => 500]
                );
            }

            $translations_map[$target_lang] = $target_post_id;
            update_post_meta($source_id, '_verbocat_translations', $translations_map);
        }

        // Update tracking metadata
        update_post_meta($target_post_id, '_verbocat_is_translation', '1');
        update_post_meta($target_post_id, '_verbocat_source_post_id', $source_id);
        update_post_meta($target_post_id, '_verbocat_lang', $target_lang);
        update_post_meta($target_post_id, '_verbocat_translation_status', 'human_reviewed');
        update_post_meta($target_post_id, '_verbocat_human_reviewed_at', current_time('mysql'));
        if (!empty($linguist_info)) {
            update_post_meta($target_post_id, '_verbocat_reviewed_by', maybe_serialize($linguist_info));
        }

        // Also update source post status
        update_post_meta($source_id, '_verbocat_translation_status', 'human_reviewed');

        return rest_ensure_response([
            'success'         => true,
            'source_post_id'  => $source_id,
            'updated_post_id' => $target_post_id,
            'target_lang'     => $target_lang,
            'status'          => 'human_reviewed',
            'message'         => 'WordPress post successfully updated from Centroid human review.'
        ]);
    }
}
