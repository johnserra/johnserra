export interface LegacyPruneQuery {
  is(column: string, value: null): LegacyPruneQuery;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface LegacyPruneClient {
  from(table: "career_context"): { delete(): LegacyPruneQuery };
}

export async function pruneGenuineLegacyRows(client: LegacyPruneClient): Promise<void> {
  const { error } = await client
    .from("career_context")
    .delete()
    .is("wordpress_id", null)
    .is("document_type", null);
  if (error) throw new Error(`Failed to prune legacy career context rows: ${error.message}`);
}
