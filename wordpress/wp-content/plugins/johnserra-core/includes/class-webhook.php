<?php

namespace JohnSerra\Core;

use WP_Post;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Webhook {
	private const META_LOCALE = 'locale';

	public static function register(): void {
		add_action( 'wp_after_insert_post', array( self::class, 'content_saved' ), 20, 4 );
		add_action( 'before_delete_post', array( self::class, 'content_deleted' ), 10, 2 );
		add_filter( 'preview_post_link', array( self::class, 'preview_link' ), 10, 2 );
	}

	public static function preview_link( string $preview_link, WP_Post $post ): string {
		if (
			! Content_Model::is_supported_post_type( $post->post_type )
			|| ! defined( 'JOHNSERRA_FRONTEND_URL' )
			|| ! defined( 'JOHNSERRA_WEBHOOK_SECRET' )
		) {
			return $preview_link;
		}

		$locale = (string) get_post_meta( $post->ID, self::META_LOCALE, true );
		if ( ! in_array( $locale, array( 'en', 'tr' ), true ) ) {
			return $preview_link;
		}

		$base_url = trailingslashit( (string) JOHNSERRA_FRONTEND_URL ) . 'api/preview/wordpress';
		if ( ! wp_http_validate_url( $base_url ) ) {
			return $preview_link;
		}

		return add_query_arg(
			array(
				'content_id' => $post->ID,
				'locale'     => $locale,
				'token'      => hash_hmac( 'sha256', $post->ID . ':' . $locale, (string) JOHNSERRA_WEBHOOK_SECRET ),
			),
			$base_url
		);
	}

	public static function content_saved( int $post_id, WP_Post $post, bool $update, ?WP_Post $post_before ): void {
		unset( $update );

		if ( wp_is_post_revision( $post_id ) || ! Content_Model::is_supported_post_type( $post->post_type ) ) {
			return;
		}

		$was_published = $post_before instanceof WP_Post && 'publish' === $post_before->post_status;
		$is_published  = 'publish' === $post->post_status;

		if ( ! $was_published && ! $is_published ) {
			return;
		}

		self::send( $post, $is_published ? 'upsert' : 'delete' );
	}

	public static function content_deleted( int $post_id, WP_Post $post ): void {
		if ( 'publish' !== $post->post_status || ! Content_Model::is_supported_post_type( $post->post_type ) ) {
			return;
		}

		self::send( $post, 'delete' );
	}

	private static function send( WP_Post $post, string $operation ): void {
		if ( ! defined( 'JOHNSERRA_FRONTEND_WEBHOOK_URL' ) || ! defined( 'JOHNSERRA_WEBHOOK_SECRET' ) ) {
			return;
		}

		$url    = (string) JOHNSERRA_FRONTEND_WEBHOOK_URL;
		$secret = (string) JOHNSERRA_WEBHOOK_SECRET;
		$locale = (string) get_post_meta( $post->ID, self::META_LOCALE, true );

		if ( ! wp_http_validate_url( $url ) || '' === $secret || ! in_array( $locale, array( 'en', 'tr' ), true ) ) {
			error_log( sprintf( 'John Serra webhook skipped for post %d: invalid configuration or locale.', $post->ID ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			return;
		}

		$payload = array(
			'event_id'     => wp_generate_uuid4(),
			'wordpress_id' => $post->ID,
			'content_type' => $post->post_type,
			'locale'       => $locale,
			'operation'    => $operation,
			'modified_gmt' => get_post_modified_time( 'c', true, $post ),
		);
		$body = wp_json_encode( $payload );

		if ( ! is_string( $body ) ) {
			return;
		}

		$response = wp_remote_post(
			$url,
			array(
				'timeout'     => 10,
				'redirection' => 0,
				'headers'     => array(
					'Content-Type'             => 'application/json',
					'X-JohnSerra-Signature'    => 'sha256=' . hash_hmac( 'sha256', $body, $secret ),
				),
				'body'        => $body,
			)
		);

		if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) >= 300 ) {
			$message = is_wp_error( $response ) ? $response->get_error_message() : 'HTTP ' . wp_remote_retrieve_response_code( $response );
			error_log( sprintf( 'John Serra webhook failed for post %d: %s', $post->ID, $message ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		}
	}
}
