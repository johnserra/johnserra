<?php

namespace JohnSerra\Core;

use WP_Post;
use WP_Query;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Editorial presentation only: content types, capabilities and REST contracts stay intact. */
final class Admin_Studio {
	private static array $system_links = array();
	private static array $translations = array();

	public static function register(): void {
		add_action( 'init', array( self::class, 'article_labels' ), 30 );
		add_action( 'admin_menu', array( self::class, 'navigation' ), 999 );
		add_filter( 'custom_menu_order', '__return_true' );
		add_filter( 'menu_order', array( self::class, 'menu_order' ) );
		add_action( 'wp_dashboard_setup', array( self::class, 'dashboard' ), 20 );
		add_action( 'restrict_manage_posts', array( self::class, 'filters' ), 10, 2 );
		add_action( 'pre_get_posts', array( self::class, 'filter_query' ) );
		add_filter( 'posts_where', array( self::class, 'translation_where' ), 10, 2 );
		add_filter( 'post_row_actions', array( self::class, 'row_actions' ), 10, 2 );
		add_filter( 'page_row_actions', array( self::class, 'row_actions' ), 10, 2 );
		add_action( 'add_meta_boxes', array( self::class, 'editor_box' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( self::class, 'styles' ) );
		add_filter( 'admin_title', array( self::class, 'admin_title' ) );
		foreach ( Content_Model::SUPPORTED_POST_TYPES as $type ) {
			add_filter( "manage_{$type}_posts_columns", array( self::class, 'columns' ) );
			add_action( "manage_{$type}_posts_custom_column", array( self::class, 'column' ), 10, 2 );
		}
	}

	public static function article_labels(): void {
		$type = get_post_type_object( 'post' );
		if ( ! $type ) return;
		foreach ( array( 'name' => 'Articles', 'singular_name' => 'Article', 'menu_name' => 'Articles', 'all_items' => 'All Articles', 'add_new_item' => 'Add New Article', 'edit_item' => 'Edit Article', 'new_item' => 'New Article', 'view_item' => 'View Article', 'search_items' => 'Search Articles' ) as $key => $label ) {
			$type->labels->$key = $label;
		}
	}

	public static function navigation(): void {
		global $menu;
		remove_menu_page( 'edit-comments.php' );
		if ( ! current_user_can( 'manage_options' ) ) {
			remove_menu_page( 'themes.php' );
			return;
		}
		$system = array( 'themes.php', 'plugins.php', 'users.php', 'tools.php', 'options-general.php', 'edit.php?post_type=acf-field-group' );
		foreach ( $menu as $position => $item ) {
			if ( in_array( $item[2], $system, true ) && current_user_can( $item[1] ) ) {
				self::$system_links[] = array( 'label' => wp_strip_all_tags( $item[0] ), 'url' => admin_url( $item[2] ) );
				remove_menu_page( $item[2] );
			}
			if ( 'index.php' === $item[2] ) $menu[ $position ][0] = 'Content Studio';
		}
		add_menu_page( 'System', 'System', 'manage_options', 'js-system', array( self::class, 'system_page' ), 'dashicons-admin-tools', 80 );
	}

	public static function system_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) return;
		echo '<div class="wrap"><h1>System</h1><p>Maintenance and configuration for John Serra Content Studio.</p><ul class="js-studio-links">';
		foreach ( self::$system_links as $link ) {
			printf( '<li><a class="button" href="%s">%s</a></li>', esc_url( $link['url'] ), esc_html( $link['label'] ) );
		}
		printf( '<li><a class="button" href="%s">Updates</a></li></ul></div>', esc_url( admin_url( 'update-core.php' ) ) );
	}

	public static function menu_order( array $order ): array {
		$first = array( 'index.php', 'edit.php', 'edit.php?post_type=js_project', 'edit.php?post_type=page', 'upload.php' );
		return array_merge( array_values( array_intersect( $first, $order ) ), array_values( array_diff( $order, $first ) ) );
	}

	public static function admin_title( string $title ): string {
		return $title . ' — Content Studio';
	}

	public static function columns( array $columns ): array {
		$date = $columns['date'] ?? 'Date';
		unset( $columns['date'] );
		return $columns + array( 'js_language' => 'Language', 'js_translation' => 'Translation', 'js_summary' => 'Summary', 'js_image' => 'Image', 'date' => $date );
	}

	public static function column( string $column, int $post_id ): void {
		$post = get_post( $post_id );
		if ( ! $post ) return;
		if ( 'js_language' === $column ) echo esc_html( array( 'en' => 'English', 'tr' => 'Turkish' )[ get_post_meta( $post_id, 'locale', true ) ] ?? 'Not set' );
		if ( 'js_summary' === $column ) {
			$summary = wp_strip_all_tags( (string) get_post_meta( $post_id, 'summary', true ) );
			echo $summary ? esc_html( wp_trim_words( $summary, 18 ) ) : '<span class="js-studio-attention">Missing summary</span>';
		}
		if ( 'js_image' === $column ) echo has_post_thumbnail( $post_id ) ? 'Featured image' : ( 'post' === $post->post_type ? 'Title card fallback' : 'No featured image' );
		if ( 'js_translation' === $column ) self::translation_label( $post );
	}

	private static function translation_posts( WP_Post $post ): array {
		if ( isset( self::$translations[ $post->ID ] ) ) return self::$translations[ $post->ID ];
		$locale = get_post_meta( $post->ID, 'locale', true );
		$group = (string) get_post_meta( $post->ID, 'translation_group_id', true );
		if ( ! in_array( $locale, array( 'en', 'tr' ), true ) || ! wp_is_uuid( $group ) ) return array();
		$peers = get_posts( array(
			'post_type' => $post->post_type, 'post_status' => array( 'publish', 'draft', 'pending', 'future', 'private' ),
			'posts_per_page' => -1, 'post__not_in' => array( $post->ID ), 'orderby' => 'ID', 'order' => 'ASC',
			'meta_query' => array( array( 'key' => 'translation_group_id', 'value' => $group ), array( 'key' => 'locale', 'value' => 'en' === $locale ? 'tr' : 'en' ) ),
		) );
		return self::$translations[ $post->ID ] = array_values( array_filter( $peers, static fn( WP_Post $peer ): bool => current_user_can( 'read_post', $peer->ID ) ) );
	}

	private static function translation_label( WP_Post $post ): void {
		$peers = self::translation_posts( $post );
		if ( count( $peers ) > 1 ) { echo '<span class="js-studio-attention">Multiple matches — check pairing</span>'; return; }
		if ( ! $peers ) { echo '<span class="js-studio-attention">Not linked</span>'; return; }
		$peer = $peers[0];
		$label = ucfirst( $peer->post_status );
		if ( current_user_can( 'edit_post', $peer->ID ) ) {
			printf( '<a href="%s">%s translation</a>', esc_url( get_edit_post_link( $peer->ID, 'raw' ) ), esc_html( $label ) );
		} else echo esc_html( $label . ' translation' );
	}

	private static function filter_value( string $name ): string {
		return isset( $_GET[ $name ] ) && is_string( $_GET[ $name ] ) ? sanitize_key( wp_unslash( $_GET[ $name ] ) ) : '';
	}

	public static function filters( string $type, string $which ): void {
		if ( 'top' !== $which || ! Content_Model::is_supported_post_type( $type ) ) return;
		echo '<label class="screen-reader-text" for="js-language">Language</label><select id="js-language" name="js_language"><option value="">All languages</option>';
		foreach ( array( 'en' => 'English', 'tr' => 'Turkish' ) as $value => $label ) printf( '<option value="%s" %s>%s</option>', esc_attr( $value ), selected( self::filter_value( 'js_language' ), $value, false ), esc_html( $label ) );
		echo '</select><label class="screen-reader-text" for="js-translation">Translation status</label><select id="js-translation" name="js_translation"><option value="">All translation statuses</option>';
		printf( '<option value="missing" %s>Needs published translation</option></select>', selected( self::filter_value( 'js_translation' ), 'missing', false ) );
	}

	public static function filter_query( WP_Query $query ): void {
		if ( ! is_admin() || ! $query->is_main_query() || ! Content_Model::is_supported_post_type( (string) $query->get( 'post_type', 'post' ) ) ) return;
		$locale = self::filter_value( 'js_language' );
		if ( in_array( $locale, array( 'en', 'tr' ), true ) ) {
			$meta = $query->get( 'meta_query' );
			$query->set( 'meta_query', array( 'relation' => 'AND', is_array( $meta ) ? $meta : array(), array( 'key' => 'locale', 'value' => $locale ) ) );
		}
		if ( 'missing' === self::filter_value( 'js_translation' ) ) $query->set( 'js_missing_translation', true );
	}

	public static function translation_where( string $where, WP_Query $query ): string {
		if ( ! is_admin() || ! $query->get( 'js_missing_translation' ) || ( ! $query->is_main_query() && ! $query->get( 'js_studio_query' ) ) ) return $where;
		global $wpdb;
		// Match the public translation contract: exactly one published peer in the other locale.
		return $where . " AND 1 <> (SELECT COUNT(DISTINCT peer.ID) FROM {$wpdb->posts} peer
		 INNER JOIN {$wpdb->postmeta} pg ON pg.post_id = peer.ID AND pg.meta_key = 'translation_group_id'
		 INNER JOIN {$wpdb->postmeta} sg ON sg.post_id = {$wpdb->posts}.ID AND sg.meta_key = 'translation_group_id' AND sg.meta_value = pg.meta_value
		 INNER JOIN {$wpdb->postmeta} pl ON pl.post_id = peer.ID AND pl.meta_key = 'locale'
		 INNER JOIN {$wpdb->postmeta} sl ON sl.post_id = {$wpdb->posts}.ID AND sl.meta_key = 'locale'
		 WHERE peer.post_status = 'publish' AND peer.post_type = {$wpdb->posts}.post_type AND peer.ID <> {$wpdb->posts}.ID
		 AND sg.meta_value REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
		 AND ((sl.meta_value = 'en' AND pl.meta_value = 'tr') OR (sl.meta_value = 'tr' AND pl.meta_value = 'en')))";
	}

	public static function frontend_url( WP_Post $post ): ?string {
		$locale = get_post_meta( $post->ID, 'locale', true );
		if ( ! in_array( $locale, array( 'en', 'tr' ), true ) || ! $post->post_name ) return null;
		$prefix = 'tr' === $locale ? '/tr' : '';
		if ( 'post' === $post->post_type ) $path = '/blog/' . $post->post_name;
		elseif ( Content_Model::PROJECT_POST_TYPE === $post->post_type ) $path = ( 'tr' === $locale ? '/projeler/' : '/projects/' ) . $post->post_name;
		elseif ( 'page' === $post->post_type ) {
			$key = get_post_meta( $post->ID, 'legacy_source_key', true );
			if ( $locale . '/about/index' === $key ) $path = 'tr' === $locale ? '/hakkimda' : '/about';
			elseif ( $locale . '/privacy-policy/index' === $key ) $path = 'tr' === $locale ? '/gizlilik-politikasi' : '/privacy-policy';
			else return null;
		} else return null;
		$base = defined( 'JOHNSERRA_FRONTEND_URL' ) ? (string) JOHNSERRA_FRONTEND_URL : 'https://johnserra.com';
		return rtrim( $base, '/' ) . $prefix . $path;
	}

	public static function row_actions( array $actions, WP_Post $post ): array {
		if ( ! Content_Model::is_supported_post_type( $post->post_type ) ) return $actions;
		unset( $actions['view'] );
		$url = self::frontend_url( $post );
		if ( 'publish' === $post->post_status && $url ) $actions['js_frontend'] = sprintf( '<a href="%s" target="_blank" rel="noopener">Open published content</a>', esc_url( $url ) );
		return $actions;
	}

	public static function editor_box( string $type, WP_Post $post ): void {
		if ( Content_Model::is_supported_post_type( $type ) ) add_meta_box( 'js-editor-studio', 'Content Studio', array( self::class, 'editor_content' ), $type, 'side', 'high' );
	}

	public static function editor_content( WP_Post $post ): void {
		echo '<p><strong>Translation</strong><br>';
		self::translation_label( $post );
		echo '</p><p>Choose the equivalent article in <strong>Translation Peer</strong> below. Set its language before pairing; the shared identity is managed automatically.</p>';
		$url = self::frontend_url( $post );
		if ( 'publish' === $post->post_status && $url ) printf( '<p><a class="button" href="%s" target="_blank" rel="noopener">Open published content</a></p>', esc_url( $url ) );
		if ( $url && current_user_can( 'edit_post', $post->ID ) && defined( 'JOHNSERRA_WEBHOOK_SECRET' ) && defined( 'JOHNSERRA_FRONTEND_URL' ) ) printf( '<p><a class="button" href="%s" target="_blank" rel="noopener">Preview on johnserra.com</a></p>', esc_url( get_preview_post_link( $post ) ) );
	}

	public static function dashboard(): void {
		if ( ! current_user_can( 'edit_posts' ) ) return;
		remove_meta_box( 'dashboard_primary', 'dashboard', 'side' );
		remove_meta_box( 'dashboard_quick_press', 'dashboard', 'side' );
		remove_action( 'welcome_panel', 'wp_welcome_panel' );
		wp_add_dashboard_widget( 'js-studio-work', 'John Serra Content Studio', array( self::class, 'work_widget' ) );
		wp_add_dashboard_widget( 'js-studio-translations', 'Translation backlog', array( self::class, 'translation_widget' ) );
		if ( current_user_can( 'manage_options' ) ) wp_add_dashboard_widget( 'js-studio-publishing', 'Publishing connection', array( self::class, 'publishing_widget' ) );
	}

	private static function work_list( array $posts ): void {
		echo '<ul class="js-studio-work">';
		foreach ( $posts as $post ) {
			if ( ! current_user_can( 'edit_post', $post->ID ) ) continue;
			printf( '<li><a href="%s">%s</a> <span>[%s · %s]</span></li>', esc_url( get_edit_post_link( $post->ID, 'raw' ) ), esc_html( get_the_title( $post ) ?: '(Untitled)' ), esc_html( strtoupper( (string) get_post_meta( $post->ID, 'locale', true ) ) ), esc_html( $post->post_status ) );
		}
		echo '</ul>';
	}

	public static function work_widget(): void {
		printf( '<p><a class="button button-primary" href="%s">New article</a> <a class="button" href="%s">All articles</a></p><h3>Drafts and review</h3>', esc_url( admin_url( 'post-new.php' ) ), esc_url( admin_url( 'edit.php' ) ) );
		$args = array( 'post_type' => 'post', 'post_status' => array( 'draft', 'pending' ), 'posts_per_page' => 8, 'orderby' => 'modified', 'order' => 'DESC' );
		if ( ! current_user_can( 'edit_others_posts' ) ) $args['author'] = get_current_user_id();
		$posts = get_posts( $args );
		if ( ! $posts ) echo '<p>No drafts awaiting work.</p>';
		self::work_list( $posts );
	}

	public static function translation_widget(): void {
		$args = array( 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => 8, 'js_missing_translation' => true, 'js_studio_query' => true, 'suppress_filters' => false );
		if ( ! current_user_can( 'edit_others_posts' ) ) $args['author'] = get_current_user_id();
		$posts = get_posts( $args );
		echo '<p>Published articles without exactly one published translation. Linked drafts stay here until published.</p>';
		if ( ! $posts ) echo '<p>All published articles have a published translation.</p>';
		self::work_list( $posts );
		printf( '<p><a href="%s">View translation backlog</a></p>', esc_url( admin_url( 'edit.php?post_status=publish&js_translation=missing' ) ) );
	}

	public static function publishing_widget(): void {
		$configured = defined( 'JOHNSERRA_FRONTEND_WEBHOOK_URL' ) && defined( 'JOHNSERRA_FRONTEND_URL' ) && defined( 'JOHNSERRA_WEBHOOK_SECRET' );
		echo $configured ? '<p>Frontend preview and publishing connection configured.</p>' : '<p class="js-studio-attention">Frontend connection needs configuration.</p>';
		$last = get_option( 'johnserra_last_webhook_delivery' );
		if ( ! is_array( $last ) ) { echo '<p>No delivery recorded since this dashboard was installed.</p>'; return; }
		printf( '<p>Last delivery: %s<br>%s</p>', esc_html( wp_date( 'Y-m-d H:i', (int) $last['time'] ) ), esc_html( ! empty( $last['accepted'] ) ? 'Frontend accepted the update.' : 'Delivery failed — check the server log.' ) );
		echo '<p>Acceptance confirms receipt, not completion of search indexing.</p>';
	}

	public static function styles(): void {
		$screen = get_current_screen();
		if ( ! $screen || ( ! in_array( $screen->base, array( 'dashboard', 'edit', 'upload', 'toplevel_page_js-system' ), true ) ) ) return;
		wp_enqueue_style( 'johnserra-studio', plugins_url( 'assets/admin-studio.css', JOHNSERRA_CORE_FILE ), array(), JOHNSERRA_CORE_VERSION );
	}
}
