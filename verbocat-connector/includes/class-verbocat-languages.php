<?php
/**
 * Verbocat Language Metadata Dictionary
 *
 * @package Verbocat_Connector
 */

if (!defined('ABSPATH')) {
    exit;
}

class Verbocat_Languages {

    /**
     * Get all supported languages with codes, native names, English names, and flag emojis
     */
    public static function get_all_languages() {
        return [
            'en' => ['name' => 'English', 'native' => 'English', 'flag' => '🇺🇸'],
            'es' => ['name' => 'Spanish', 'native' => 'Español', 'flag' => '🇪🇸'],
            'hi' => ['name' => 'Hindi', 'native' => 'हिन्दी', 'flag' => '🇮🇳'],
            'fr' => ['name' => 'French', 'native' => 'Français', 'flag' => '🇫🇷'],
            'de' => ['name' => 'German', 'native' => 'Deutsch', 'flag' => '🇩🇪'],
            'it' => ['name' => 'Italian', 'native' => 'Italiano', 'flag' => '🇮🇹'],
            'pt' => ['name' => 'Portuguese', 'native' => 'Português', 'flag' => '🇵🇹'],
            'ru' => ['name' => 'Russian', 'native' => 'Русский', 'flag' => '🇷🇺'],
            'zh' => ['name' => 'Chinese', 'native' => '中文', 'flag' => '🇨🇳'],
            'ja' => ['name' => 'Japanese', 'native' => '日本語', 'flag' => '🇯🇵'],
            'ar' => ['name' => 'Arabic', 'native' => 'العربية', 'flag' => '🇸🇦'],
            'bn' => ['name' => 'Bengali', 'native' => 'বাংলা', 'flag' => '🇧🇩'],
            'pa' => ['name' => 'Punjabi', 'native' => 'ਪੰਜਾਬੀ', 'flag' => '🇮🇳'],
            'ta' => ['name' => 'Tamil', 'native' => 'தமிழ்', 'flag' => '🇮🇳'],
            'te' => ['name' => 'Telugu', 'native' => 'తెలుగు', 'flag' => '🇮🇳'],
            'mr' => ['name' => 'Marathi', 'native' => 'मराठी', 'flag' => '🇮🇳'],
            'gu' => ['name' => 'Gujarati', 'native' => 'ગુજરાતી', 'flag' => '🇮🇳'],
            'kn' => ['name' => 'Kannada', 'native' => 'ಕನ್ನಡ', 'flag' => '🇮🇳'],
            'ml' => ['name' => 'Malayalam', 'native' => 'മലയാളം', 'flag' => '🇮🇳'],
            'ur' => ['name' => 'Urdu', 'native' => 'اردو', 'flag' => '🇵🇰'],
            'nl' => ['name' => 'Dutch', 'native' => 'Nederlands', 'flag' => '🇳🇱'],
            'pl' => ['name' => 'Polish', 'native' => 'Polski', 'flag' => '🇵🇱'],
            'tr' => ['name' => 'Turkish', 'native' => 'Türkçe', 'flag' => '🇹🇷'],
            'ko' => ['name' => 'Korean', 'native' => '한국어', 'flag' => '🇰🇷'],
            'vi' => ['name' => 'Vietnamese', 'native' => 'Tiếng Việt', 'flag' => '🇻🇳'],
            'sv' => ['name' => 'Swedish', 'native' => 'Svenska', 'flag' => '🇸🇪'],
            'no' => ['name' => 'Norwegian', 'native' => 'Norsk', 'flag' => '🇳🇴'],
            'da' => ['name' => 'Danish', 'native' => 'Dansk', 'flag' => '🇩🇰'],
            'fi' => ['name' => 'Finnish', 'native' => 'Suomi', 'flag' => '🇫🇮'],
            'el' => ['name' => 'Greek', 'native' => 'Ελληνικά', 'flag' => '🇬🇷'],
            'he' => ['name' => 'Hebrew', 'native' => 'עברית', 'flag' => '🇮🇱'],
            'th' => ['name' => 'Thai', 'native' => 'ไทย', 'flag' => '🇹🇭'],
            'id' => ['name' => 'Indonesian', 'native' => 'Bahasa Indonesia', 'flag' => '🇮🇩'],
            'ms' => ['name' => 'Malay', 'native' => 'Bahasa Melayu', 'flag' => '🇲🇾'],
            'cs' => ['name' => 'Czech', 'native' => 'Čeština', 'flag' => '🇨🇿'],
            'ro' => ['name' => 'Romanian', 'native' => 'Română', 'flag' => '🇷🇴'],
            'hu' => ['name' => 'Hungarian', 'native' => 'Magyar', 'flag' => '🇭🇺'],
            'uk' => ['name' => 'Ukrainian', 'native' => 'Українська', 'flag' => '🇺🇦']
        ];
    }

    /**
     * Get single language metadata by code
     */
    public static function get_language($code) {
        $languages = self::get_all_languages();
        $clean = strtolower(trim($code));
        return $languages[$clean] ?? [
            'name'   => strtoupper($clean),
            'native' => strtoupper($clean),
            'flag'   => '🌐'
        ];
    }
}
