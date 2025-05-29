// Database context for projects with PGlite
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { PGlite } from '@electric-sql/pglite';
import { getDB, initSchema, createDBOperations } from './db-core';
import type { DatabaseContextType, ParseSchema, DBOperations } from './types';

export const DatabaseContext = createContext<DatabaseContextType<any>>({
  $raw: null,
  db: null,
  isInitialized: false,
  error: null,
});

interface DatabaseProviderProps<SQL extends string> {
  schema: SQL;
  dbName?: string;
  debug?: boolean;
  children: ReactNode;
}

export function DatabaseProvider<SQL extends string>({
  schema,
  dbName = 'bolt-projects-db',
  debug = false,
  children,
}: DatabaseProviderProps<SQL>) {
  const [$raw, setRaw] = useState<PGlite | null>(null);
  const [db, setDb] = useState<DBOperations<ParseSchema<SQL>> | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Skip initialization on server side
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    const setupDatabase = async () => {
      try {
        if (debug) {
          console.log(`[PGlite ${dbName}] Setting up database.`);
        }

        // Get DB instance
        const database = await getDB(dbName);
        if (!isMounted) {
          return;
        }
        setRaw(database);
        if (debug) {
          console.log(`[PGlite ${dbName}] Database instance obtained.`);
        }

        // Initialize schema
        await initSchema(database, schema);
        if (!isMounted) {
          return;
        }
        if (debug) {
          console.log(`[PGlite ${dbName}] Schema initialized.`);
        }

        // Create operations
        const sdk = createDBOperations(database, schema, false, debug);
        if (!isMounted) {
          return;
        }
        setDb(sdk);
        if (debug) {
          console.log(`[PGlite ${dbName}] Database operations created.`);
        }

        // Mark as initialized
        setIsInitialized(true);
        setError(null);
        if (debug) {
          console.log(`[PGlite ${dbName}] Database initialization complete.`);
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        console.error(`[PGlite ${dbName}] Failed to initialize database:`, err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsInitialized(false);
        setDb(null);
      }
    };

    // Reset state before re-initializing
    setIsInitialized(false);
    setDb(null);
    setError(null);
    setRaw(null);

    // Run setup
    setupDatabase();

    // Cleanup function
    return () => {
      isMounted = false;
      if (debug) {
        console.log(`[PGlite ${dbName}] Provider unmounting.`);
      }
    };
  }, [schema, dbName, debug]);

  const value: DatabaseContextType<any> = {
    $raw,
    db,
    isInitialized,
    error,
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

/**
 * Hook to access the database context
 */
export function useDatabase<Schema>(): DatabaseContextType<Schema> {
  const context = useContext<DatabaseContextType<Schema>>(DatabaseContext as any);

  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }

  return context;
}

/**
 * Hook to access a specific table in the database
 */
export function useTable<Schema, TableName extends keyof Schema>(
  tableName: TableName
): Schema[TableName] extends object ? DBOperations<Schema>[TableName] | null : null {
  const context = useContext<DatabaseContextType<Schema>>(DatabaseContext as any);

  if (context === undefined) {
    throw new Error('useTable must be used within a DatabaseProvider');
  }

  const { db, isInitialized, error } = context;

  if (error) {
    throw error;
  }

  if (!isInitialized || !db) {
    return null;
  }

  const tableOperations = db[tableName as string as keyof typeof db];

  if (!tableOperations) {
    return null;
  }

  return tableOperations as any;
}