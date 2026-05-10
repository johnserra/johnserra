import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

// Initialize the SQLite database
// In a Next.js environment, we ensure we only instantiate it once
const dbPath = path.resolve(process.cwd(), 'cv_optimizer.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create the cv_documents table if it doesn't exist
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS cv_documents (
    id TEXT PRIMARY KEY,
    original_filename TEXT NOT NULL,
    markdown_content TEXT NOT NULL,
    ats_suggestions TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;
db.exec(createTableQuery);

export function insertCvDocument(filename: string, markdown: string) {
  const id = crypto.randomUUID();
  const stmt = db.prepare('INSERT INTO cv_documents (id, original_filename, markdown_content) VALUES (?, ?, ?)');
  stmt.run(id, filename, markdown);
  return id;
}

export function updateAtsSuggestions(id: string, suggestions: string) {
  const stmt = db.prepare('UPDATE cv_documents SET ats_suggestions = ? WHERE id = ?');
  stmt.run(suggestions, id);
}

export function getCvDocument(id: string) {
  const stmt = db.prepare('SELECT * FROM cv_documents WHERE id = ?');
  return stmt.get(id);
}

export default db;
