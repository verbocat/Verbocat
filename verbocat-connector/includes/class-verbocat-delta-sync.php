<?php
/**
 * Verbocat Smart Delta Sync Engine
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Delta_Sync {

    public static $is_syncing = false;

    /**
     * Translate and synchronize a WordPress post or page with optional Component/Block Selection
     *
     * @param WP_Post $post                Post object
     * @param array   $target_langs        Array of target language codes
     * @param string  $source_lang         Source language code
     * @param bool    $enable_delta_sync   Whether to use block diffing
     * @param array   $selected_components Optional array of component keys to translate (e.g. ['__title__', 'block_0', 'block_2'])
     * @return array|string|WP_Error
     */
    public static function sync_post($post, $target_langs = null, $source_lang = null, $enable_delta_sync = true, $selected_components = null) {
        if (self::$is_syncing) {
            return __('Translation already in progress.', 'verbocat-connector');
        }
        self::$is_syncing = true;

        try {
            return self::execute_sync_post($post, $target_langs, $source_lang, $enable_delta_sync, $selected_components);
        } finally {
            self::$is_syncing = false;
        }
    }

    /**
     * Internal execution of post translation and sync
     */
    private static function execute_sync_post($post, $target_langs = null, $source_lang = null, $enable_delta_sync = true, $selected_components = null) {
        $opts = Verbocat_Settings::get_options();

        if (empty($target_langs)) {
            $raw = array_map('trim', explode(',', $opts['target_langs']));
            $target_langs = array_filter($raw);
        }

        if (empty($target_langs)) {
            return new WP_Error('no_targets', __('No target languages specified for translation.', 'verbocat-connector'));
        }

        $src_lang = $source_lang ?: ($opts['source_lang'] ?: 'en');
        $use_delta = $enable_delta_sync && ($opts['delta_sync'] === '1');

        $content = $post->post_content;
        $source_segments = self::extract_content_blocks($content);
        $translations_map = get_post_meta($post->ID, '_verbocat_translations', true) ?: [];

        $has_component_filter = is_array($selected_components) && !empty($selected_components);

        $updated_languages = [];
        $skipped_languages = [];

        foreach ($target_langs as $tgt_lang) {
            $existing_trans_id = $translations_map[$tgt_lang] ?? null;
            $has_existing = $existing_trans_id && get_post($existing_trans_id);

            // Stored block hashes and translations from previous translation
            $prev_hashes = $has_existing ? (get_post_meta($existing_trans_id, '_verbocat_block_hashes', true) ?: []) : [];
            $prev_block_translations = $has_existing ? (get_post_meta($existing_trans_id, '_verbocat_block_translations', true) ?: []) : [];

            $final_block_translations = [];
            $new_hashes = [];
            $payload_items = [];

            // 1. Title Component Selection & Check
            $title_selected = !$has_component_filter || in_array('__title__', $selected_components);
            $title_hash = md5($post->post_title);
            $prev_title_hash = $has_existing ? get_post_meta($existing_trans_id, '_verbocat_title_hash', true) : '';
            $need_title_trans = $title_selected && (!$has_existing || !$use_delta || ($title_hash !== $prev_title_hash));

            if ($need_title_trans) {
                $payload_items[] = ['key' => '__title__', 'source' => $post->post_title];
            }

            // 2. Excerpt Component Selection & Check
            $excerpt_selected = !$has_component_filter || in_array('__excerpt__', $selected_components);
            if (!empty($post->post_excerpt)) {
                $excerpt_hash = md5($post->post_excerpt);
                $prev_excerpt_hash = $has_existing ? get_post_meta($existing_trans_id, '_verbocat_excerpt_hash', true) : '';
                if ($excerpt_selected && (!$has_existing || !$use_delta || ($excerpt_hash !== $prev_excerpt_hash))) {
                    $payload_items[] = ['key' => '__excerpt__', 'source' => $post->post_excerpt];
                }
            }

            // 3. Content Blocks / Paragraphs Selection & Check
            foreach ($source_segments as $idx => $block) {
                $block_key = 'block_' . $idx;
                $block_hash = md5($block['clean_text']);
                $new_hashes[$idx] = $block_hash;

                $block_is_selected = !$has_component_filter || in_array($block_key, $selected_components);

                if (!$block_is_selected) {
                    // Unselected component: keep previous translation if exists, or keep source block
                    $final_block_translations[$idx] = $prev_block_translations[$idx] ?? $block['raw_html'];
                    continue;
                }

                if ($block['is_tag']) {
                    $final_block_translations[$idx] = $block['raw_html'];
                    continue;
                }

                if ($use_delta && $has_existing && isset($prev_hashes[$idx]) && $prev_hashes[$idx] === $block_hash && !empty($prev_block_translations[$idx])) {
                    // Unchanged: Reuse already translated block!
                    $final_block_translations[$idx] = $prev_block_translations[$idx];
                } else {
                    // Selected & (New or Modified): Queue for translation!
                    $payload_items[] = [
                        'key'    => $block_key,
                        'idx'    => $idx,
                        'source' => $block['raw_html']
                    ];
                }
            }

            // If nothing needs translation for this language, skip API call
            if (empty($payload_items) && $has_existing) {
                $skipped_languages[] = $tgt_lang;
                continue;
            }

            // Prepare items payload for Verbocat API
            $items_to_send = array_map(function($item) {
                return $item['source'];
            }, $payload_items);

            $api_payload = [
                'items'        => $items_to_send,
                'source_lang'  => $src_lang,
                'target_langs' => [$tgt_lang]
            ];

            $api_res = Verbocat_Api_Client::translate($api_payload);

            if (is_wp_error($api_res)) {
                return $api_res;
            }

            $translated_items = $api_res['translations'][$tgt_lang] ?? [];

            // Map translated items back to title, excerpt, and blocks
            $translated_title = $has_existing ? get_the_title($existing_trans_id) : $post->post_title;
            $translated_excerpt = $has_existing ? get_post_field('post_excerpt', $existing_trans_id) : $post->post_excerpt;

            foreach ($payload_items as $p_idx => $p_item) {
                $raw_trans = $translated_items[$p_idx] ?? $p_item['source'];
                $translated_str = self::clean_entity_leaks($raw_trans);

                if ($p_item['key'] === '__title__') {
                    $translated_title = $translated_str;
                } else if ($p_item['key'] === '__excerpt__') {
                    $translated_excerpt = $translated_str;
                } else if (isset($p_item['idx'])) {
                    $final_block_translations[$p_item['idx']] = $translated_str;
                }
            }

            // Re-assemble full translated content
            $assembled_content = self::clean_entity_leaks(self::reassemble_content_blocks($source_segments, $final_block_translations));

            // Check ICE matching status from API response
            $is_ice_matched = !empty($api_res['ice_matches'][$tgt_lang]) || !empty($api_res['is_ice_matched']);
            $push_policy = $opts['auto_push_policy'] ?? 'ice_only';

            // Determine target post status according to Continuous Localization policy
            if ($push_policy === 'always_publish') {
                $target_status = 'publish';
            } elseif ($push_policy === 'always_draft') {
                $target_status = 'draft';
            } else {
                // 'ice_only' policy: Auto-Publish only if 100% ICE matched, otherwise Draft for review
                $target_status = $is_ice_matched ? 'publish' : 'draft';
            }

            if ($has_existing) {
                // Update existing post
                $current_status = get_post_status($existing_trans_id) ?: 'draft';
                $final_status = ($target_status === 'publish') ? 'publish' : $current_status;

                wp_update_post([
                    'ID'           => $existing_trans_id,
                    'post_title'   => $translated_title,
                    'post_content' => $assembled_content,
                    'post_excerpt' => $translated_excerpt,
                    'post_status'  => $final_status
                ]);
                $target_post_id = $existing_trans_id;
            } else {
                // Create new post with computed workflow status
                $new_id = wp_insert_post([
                    'post_title'   => $translated_title,
                    'post_content' => $assembled_content,
                    'post_excerpt' => $translated_excerpt,
                    'post_status'  => $target_status,
                    'post_type'    => $post->post_type,
                    'post_author'  => $post->post_author,
                    'meta_input'   => [
                        '_verbocat_is_translation' => '1',
                        '_verbocat_source_post_id' => $post->ID,
                        '_verbocat_lang'           => $tgt_lang,
                        '_verbocat_is_ice_matched' => $is_ice_matched ? '1' : '0'
                    ]
                ]);

                if (!is_wp_error($new_id)) {
                    update_post_meta($new_id, '_verbocat_is_translation', '1');
                    update_post_meta($new_id, '_verbocat_source_post_id', $post->ID);
                    update_post_meta($new_id, '_verbocat_lang', $tgt_lang);
                    update_post_meta($new_id, '_verbocat_is_ice_matched', $is_ice_matched ? '1' : '0');
                    $translations_map[$tgt_lang] = $new_id;
                    $target_post_id = $new_id;
                }
            }

            if (!empty($target_post_id)) {
                update_post_meta($target_post_id, '_verbocat_is_ice_matched', $is_ice_matched ? '1' : '0');
                update_post_meta($target_post_id, '_verbocat_last_sync_time', current_time('mysql'));
                update_post_meta($target_post_id, '_verbocat_block_hashes', $new_hashes);
                update_post_meta($target_post_id, '_verbocat_block_translations', $final_block_translations);
                if ($title_selected) {
                    update_post_meta($target_post_id, '_verbocat_title_hash', $title_hash);
                }
                if ($excerpt_selected && !empty($post->post_excerpt)) {
                    update_post_meta($target_post_id, '_verbocat_excerpt_hash', md5($post->post_excerpt));
                }
                $updated_languages[] = $tgt_lang;
            }
        }

        update_post_meta($post->ID, '_verbocat_translations', $translations_map);

        if (!empty($updated_languages)) {
            $lang_names = array_map(function($code) {
                return Verbocat_Languages::get_language($code)['native'];
            }, $updated_languages);
            return sprintf(__('Successfully translated selected components into: %s', 'verbocat-connector'), implode(', ', $lang_names));
        }

        return __('Selected components are already fully up-to-date in all chosen languages.', 'verbocat-connector');
    }

    /**
     * Split HTML / Gutenberg content into translatable block segments
     */
    public static function extract_content_blocks($content) {
        $segments = [];
        if (empty($content)) return $segments;

        if (str_contains($content, '<!-- wp:')) {
            // Gutenberg block structure
            $raw_blocks = preg_split('/(<!-- \/?wp:[^>]+ -->)/s', $content, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
            foreach ($raw_blocks as $block) {
                $is_gutenberg_tag = str_starts_with(trim($block), '<!--');
                $clean = trim(strip_tags($block));
                $segments[] = [
                    'raw_html'   => $block,
                    'clean_text' => $clean,
                    'is_tag'     => $is_gutenberg_tag || empty($clean)
                ];
            }
        } else {
            // Classic Editor / Standard HTML paragraph & heading blocks
            $raw_blocks = preg_split('/(<\/?(?:p|h[1-6]|blockquote|li|div|section)[^>]*>)/is', $content, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
            foreach ($raw_blocks as $block) {
                $is_tag = str_starts_with(trim($block), '<') && str_ends_with(trim($block), '>');
                $clean = trim(strip_tags($block));
                $segments[] = [
                    'raw_html'   => $block,
                    'clean_text' => $clean,
                    'is_tag'     => $is_tag || empty($clean)
                ];
            }
        }

        return $segments;
    }

    /**
     * Re-assemble translated blocks back into full document
     */
    public static function reassemble_content_blocks($source_segments, $translated_blocks) {
        $output = '';
        foreach ($source_segments as $idx => $seg) {
            if ($seg['is_tag'] || !isset($translated_blocks[$idx])) {
                $output .= $seg['raw_html'];
            } else {
                $output .= $translated_blocks[$idx];
            }
        }
        return $output;
    }

    /**
     * Clean and normalize raw HTML/numeric entity leaks (e.g. &#8217; => ’, &#8220; => “, &#038; => &)
     */
    public static function clean_entity_leaks($str) {
        if (empty($str) || !is_string($str)) return $str;
        $decoded = html_entity_decode($str, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $decoded = wp_specialchars_decode($decoded, ENT_QUOTES);
        $decoded = preg_replace('/&?#8217;?/', "’", $decoded);
        $decoded = preg_replace('/&?#8216;?/', "‘", $decoded);
        $decoded = preg_replace('/&?#8220;?/', "“", $decoded);
        $decoded = preg_replace('/&?#8221;?/', "”", $decoded);
        $decoded = preg_replace('/&?#8230;?/', "…", $decoded);
        $decoded = preg_replace('/&?#038;?/', "&", $decoded);
        $decoded = preg_replace('/&?#039;?/', "'", $decoded);
        return $decoded;
    }
}
