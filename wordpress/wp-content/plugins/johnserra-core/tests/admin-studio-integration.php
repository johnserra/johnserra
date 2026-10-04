<?php
/** Run only in a disposable WordPress site: creates fixture content. */
if ( ! defined( 'JOHNSERRA_STUDIO_TEST_SITE' ) || ! JOHNSERRA_STUDIO_TEST_SITE ) throw new RuntimeException( 'Disposable test site required.' );

use JohnSerra\Core\Admin_Studio;

function studio_check( bool $condition, string $message ): void {
	if ( ! $condition ) throw new RuntimeException( $message );
	echo "PASS: $message\n";
}
function studio_post( string $locale, string $status, string $group, string $type = 'post' ): int {
	$id = wp_insert_post( array( 'post_title' => "Studio fixture $locale $status", 'post_status' => $status, 'post_type' => $type, 'post_name' => 'studio-' . wp_generate_uuid4() ) );
	update_post_meta( $id, 'locale', $locale );
	update_post_meta( $id, 'translation_group_id', $group );
	return $id;
}
function studio_backlog(): array {
	return get_posts( array( 'post_type' => 'post', 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => -1, 'suppress_filters' => false, 'js_missing_translation' => true, 'js_studio_query' => true ) );
}

wp_set_current_user( 1 );
$group = wp_generate_uuid4();
$english = studio_post( 'en', 'publish', $group );
$turkish = studio_post( 'tr', 'draft', $group );
studio_check( in_array( $english, studio_backlog(), true ), 'Draft translation remains in backlog.' );
wp_update_post( array( 'ID' => $turkish, 'post_status' => 'publish' ) );
studio_check( ! in_array( $english, studio_backlog(), true ) && ! in_array( $turkish, studio_backlog(), true ), 'Published pair leaves backlog in both languages.' );
$duplicate = studio_post( 'tr', 'publish', $group );
studio_check( in_array( $english, studio_backlog(), true ), 'Ambiguous published translations need attention.' );
$other = studio_post( 'tr', 'publish', wp_generate_uuid4() );
studio_check( in_array( $other, studio_backlog(), true ), 'Unpaired article remains in backlog.' );
$project = studio_post( 'en', 'publish', $group, 'js_project' );
studio_check( in_array( $other, get_posts( array( 'post_type' => 'post', 'fields' => 'ids', 'posts_per_page' => -1 ) ), true ), 'Normal content query is unaffected.' );
studio_check( Admin_Studio::frontend_url( get_post( $english ) ) === 'https://johnserra.com/blog/' . get_post( $english )->post_name, 'English frontend URL omits locale prefix.' );
studio_check( Admin_Studio::frontend_url( get_post( $turkish ) ) === 'https://johnserra.com/tr/blog/' . get_post( $turkish )->post_name, 'Turkish frontend URL uses locale prefix.' );
studio_check( str_contains( Admin_Studio::frontend_url( get_post( $project ) ), '/projects/' ), 'Project URL uses frontend project path.' );
$page = studio_post( 'tr', 'publish', wp_generate_uuid4(), 'page' );
update_post_meta( $page, 'legacy_source_key', 'tr/about/index' );
studio_check( 'https://johnserra.com/tr/hakkimda' === Admin_Studio::frontend_url( get_post( $page ) ), 'Localized About URL maps to public route.' );
update_post_meta( $page, 'legacy_source_key', 'unknown' );
studio_check( null === Admin_Studio::frontend_url( get_post( $page ) ), 'Unmapped pages do not invent frontend routes.' );
ob_start(); Admin_Studio::column( 'js_translation', $english ); $html = ob_get_clean();
studio_check( str_contains( $html, 'Multiple matches' ), 'Translation column flags ambiguous groups.' );
$columns = Admin_Studio::columns( array( 'title' => 'Title', 'date' => 'Date' ) );
studio_check( isset( $columns['title'], $columns['js_language'], $columns['js_translation'], $columns['js_summary'], $columns['js_image'] ), 'Editorial columns preserve existing columns.' );
$actions = Admin_Studio::row_actions( array( 'edit' => 'edit', 'view' => 'backend' ), get_post( $english ) );
studio_check( isset( $actions['edit'], $actions['js_frontend'] ) && ! isset( $actions['view'] ), 'Row actions keep editing and use the public frontend.' );
$draft = studio_post( 'en', 'draft', wp_generate_uuid4() );
studio_check( ! isset( Admin_Studio::row_actions( array(), get_post( $draft ) )['js_frontend'] ), 'Drafts never get a public published link.' );
ob_start(); Admin_Studio::work_widget(); Admin_Studio::translation_widget(); Admin_Studio::publishing_widget(); $html = ob_get_clean();
studio_check( str_contains( $html, 'Translation' ) || str_contains( $html, 'translation backlog' ), 'Dashboard widgets render without fatal errors.' );
studio_check( 'Articles' === get_post_type_object( 'post' )->labels->name && post_type_exists( 'post' ), 'Article branding preserves core post type.' );
echo "Content Studio integration checks passed.\n";
