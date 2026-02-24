import Link from "next/link";
import { getAllContent } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Clock, Users } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recipes — John Serra",
  description: "A collection of recipes from John Serra's kitchen.",
};

export default function RecipesPage() {
  const recipes = getAllContent("recipes");

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">Recipes</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-12">
            Things I cook. Mostly Italian, occasionally not.
          </p>

          <div className="flex flex-col gap-8">
            {recipes.map((recipe) => (
              <Link
                key={recipe.slug}
                href={`/recipes/${recipe.slug}`}
                className="group block p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                {recipe.frontmatter.tags && recipe.frontmatter.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {recipe.frontmatter.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
                  {recipe.frontmatter.title}
                </h2>
                {recipe.frontmatter.description && (
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
                    {recipe.frontmatter.description}
                  </p>
                )}
                <div className="flex gap-4">
                  {recipe.frontmatter.servings && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
                      <Users size={14} />
                      {recipe.frontmatter.servings} servings
                    </span>
                  )}
                  {recipe.frontmatter.totalTime && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
                      <Clock size={14} />
                      {recipe.frontmatter.totalTime}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
