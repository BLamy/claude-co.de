// Core database functionality for projects and threads
import { PGlite } from '@electric-sql/pglite';
import type { ParseSchema, DBOperations } from './types';

let dbInstance: PGlite | null = null;
let dbInstances: Map<string, PGlite> = new Map();

/**
 * Creates or returns a singleton database instance
 */
export async function getDB(dbName: string = 'bolt-projects-db') {
  // Use per-database-name instances to avoid conflicts
  if (dbInstances.has(dbName)) {
    return dbInstances.get(dbName)!;
  }
  
  // Only create PGlite instance on client side
  if (typeof window === 'undefined') {
    throw new Error('PGlite can only be initialized on the client side');
  }
  
  // Try to clear only timestamped or duplicate databases to avoid WebAssembly conflicts
  try {
    const databases = await indexedDB.databases();
    for (const db of databases) {
      // Only clear timestamped versions or exact duplicates
      if (db.name && db.name !== `/pglite/${dbName}` && 
          (db.name.includes(`${dbName}-`) || db.name === dbName)) {
        const deleteRequest = indexedDB.deleteDatabase(db.name);
        await new Promise((resolve, reject) => {
          deleteRequest.onsuccess = () => resolve(void 0);
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
        console.log(`Cleared stale database: ${db.name}`);
      }
    }
  } catch (error) {
    console.warn('Failed to clear IndexedDB cache:', error);
  }

  try {
    // Create PGlite instance with minimal options to avoid WebAssembly issues
    const db = new PGlite(`idb://${dbName}`, {
      relaxedDurability: true,
    });
    
    // Wait for the database to be ready
    await db.waitReady;
    
    // Test basic functionality
    const testResult = await db.query('SELECT 1 as test');
    console.log('PGlite initialized successfully, test result:', testResult.rows);
    
    // Store in both places for backward compatibility
    dbInstances.set(dbName, db);
    if (dbName === 'bolt-projects-db') {
      dbInstance = db;
    }
    
    return db;
  } catch (error) {
    console.error('Failed to create PGlite instance:', error);
    
    // Fallback: try in-memory database
    try {
      console.log('Attempting in-memory fallback database');
      const db = new PGlite(':memory:');
      
      await db.waitReady;
      dbInstances.set(dbName, db);
      
      console.warn('Using in-memory database - data will not persist');
      return db;
    } catch (fallbackError) {
      console.error('In-memory PGlite creation also failed:', fallbackError);
      throw new Error(`PGlite initialization failed: ${error}. Fallback also failed: ${fallbackError}`);
    }
  }
}

/**
 * Initialize the database schema
 */
export async function initSchema(db: PGlite, schemaSQL: string): Promise<void> {
  try {
    // Execute the schema SQL
    await db.exec(schemaSQL);
  } catch (error) {
    console.error('Error initializing schema:', error);
    throw error;
  }
}

/**
 * Encrypts a string value using a simple base64 encoding
 * In production, you'd want to use proper encryption with the AuthContext key
 */
async function encryptValue(value: string): Promise<string> {
  return btoa(value);
}

/**
 * Decrypts an encrypted string value
 */
async function decryptValue(encryptedValue: string): Promise<string> {
  try {
    return atob(encryptedValue);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Decryption Failed]';
  }
}

/**
 * Identifies all TEXT fields in a table's schema definition
 */
export function getTextFields(schemaSQL: string, tableName: string): string[] {
  const tableRegexPattern = `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName}\\s*\\(([\\s\\S]*?)\\);`;
  const tableRegex = new RegExp(tableRegexPattern, 'i');
  const tableMatch = schemaSQL.match(tableRegex);
  
  if (!tableMatch || !tableMatch[1]) {
    return [];
  }
  
  const columnDefinitionsStr = tableMatch[1];
  const textFields: string[] = [];
  
  // Simple regex to find TEXT columns
  const columnMatches = columnDefinitionsStr.matchAll(/(\w+)\s+TEXT/gi);
  
  for (const match of columnMatches) {
    if (match[1]) {
      textFields.push(match[1]);
    }
  }
  
  return textFields;
}

/**
 * Create a typed database operations object
 */
export function createDBOperations<SQL extends string>(
  db: PGlite,
  schemaSQL: SQL,
  shouldEncrypt: boolean = false,
  debug: boolean = false
): DBOperations<ParseSchema<SQL>> {
  const operations: Record<string, any> = {};

  const tableMatches = [...schemaSQL.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/gi)];

  for (const [, tableName] of tableMatches) {
    const table = tableName.trim();
    const textFields = shouldEncrypt ? getTextFields(schemaSQL, table) : [];

    operations[table] = {
      create: async (data: Record<string, any>) => {
        const processedData = { ...data };
        
        // Encrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          for (const field of textFields) {
            if (processedData[field] && typeof processedData[field] === 'string') {
              processedData[field] = await encryptValue(processedData[field]);
            }
          }
        }
        
        const keys = Object.keys(processedData);
        const values = Object.values(processedData);
        const placeholders = keys.map((_, i) => `$${i + 1}`);
        const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
        
        if (debug) console.log('[DB] Create query:', query, values);
        
        const result = await db.query(query, values);
        
        if (debug) console.log('[DB] Create result:', result);
        
        if (!result || !result.rows || result.rows.length === 0) {
          throw new Error('No row returned from INSERT');
        }
        
        // Force a checkpoint to ensure data is persisted
        try {
          await db.query('CHECKPOINT;');
          if (debug) console.log('[DB] Checkpoint completed');
        } catch (error) {
          // Checkpoint might not be available, ignore the error
          if (debug) console.log('[DB] Checkpoint not available');
        }
        
        const resultRow = result.rows[0];

        // Decrypt response if needed
        if (shouldEncrypt && textFields.length > 0) {
          const decryptedRow = { ...resultRow } as Record<string, any>;
          for (const field of textFields) {
            if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
              try {
                decryptedRow[field] = await decryptValue(decryptedRow[field]);
              } catch (e) {
                decryptedRow[field] = '[DECRYPTION FAILED]';
              }
            }
          }
          return decryptedRow;
        }
        
        return resultRow;
      },

      findMany: async (params?: Record<string, any>) => {
        let query = `SELECT * FROM ${table}`;
        const values: any[] = [];
        
        if (params?.where) {
          const whereConditions = Object.entries(params.where).map(([key, value], index) => {
            values.push(value);
            return `${key} = $${index + 1}`;
          });
          
          if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
          }
        }
        
        if (params?.orderBy) {
          const orderClauses = Object.entries(params.orderBy).map(([key, dir]) => `${key} ${dir}`);
          query += ` ORDER BY ${orderClauses.join(', ')}`;
        }
        
        if (params?.limit) {
          values.push(params.limit);
          query += ` LIMIT $${values.length}`;
        }
        
        if (params?.offset) {
          values.push(params.offset);
          query += ` OFFSET $${values.length}`;
        }
        
        if (debug) console.log('[DB] FindMany query:', query, values);
        
        const result = await db.query(query, values);
        
        // Decrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          return Promise.all(result.rows.map(async (row) => {
            const decryptedRow = { ...row } as Record<string, any>;
            for (const field of textFields) {
              if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
                try {
                  decryptedRow[field] = await decryptValue(decryptedRow[field]);
                } catch (e) {
                  decryptedRow[field] = '[DECRYPTION FAILED]';
                }
              }
            }
            return decryptedRow;
          }));
        }
        
        return result.rows;
      },

      findUnique: async (where: { id: string }) => {
        const result = await db.query(`SELECT * FROM ${table} WHERE id = $1 LIMIT 1`, [where.id]);
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        
        // Decrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          const decryptedRow = { ...row } as Record<string, any>;
          for (const field of textFields) {
            if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
              try {
                decryptedRow[field] = await decryptValue(decryptedRow[field]);
              } catch (e) {
                decryptedRow[field] = '[DECRYPTION FAILED]';
              }
            }
          }
          return decryptedRow;
        }
        
        return row;
      },

      update: async (params: { where: { id: string }, data: Record<string, any> }) => {
        const { where, data } = params;
        const processedData = { ...data };
        
        // Encrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          for (const field of textFields) {
            if (processedData[field] !== undefined && typeof processedData[field] === 'string') {
              processedData[field] = await encryptValue(processedData[field]);
            }
          }
        }
        
        const keys = Object.keys(processedData);
        const values = Object.values(processedData);
        
        if (keys.length === 0) {
          return (await operations[table].findUnique(where)) as any;
        }
        
        const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const query = `UPDATE ${table} SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`;
        
        if (debug) console.log('[DB] Update query:', query, [...values, where.id]);
        
        const result = await db.query(query, [...values, where.id]);
        const resultRow = result.rows[0];
        
        // Decrypt response if needed
        if (shouldEncrypt && textFields.length > 0) {
          const decryptedRow = { ...resultRow } as Record<string, any>;
          for (const field of textFields) {
            if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
              try {
                decryptedRow[field] = await decryptValue(decryptedRow[field]);
              } catch (e) {
                decryptedRow[field] = '[DECRYPTION FAILED]';
              }
            }
          }
          return decryptedRow;
        }
        
        return resultRow;
      },

      delete: async (where: { id: string }) => {
        const result = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [where.id]);
        
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        
        // Decrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          const decryptedRow = { ...row } as Record<string, any>;
          for (const field of textFields) {
            if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
              try {
                decryptedRow[field] = await decryptValue(decryptedRow[field]);
              } catch (e) {
                decryptedRow[field] = '[DECRYPTION FAILED]';
              }
            }
          }
          return decryptedRow;
        }
        
        return row;
      },

      deleteMany: async (params?: Record<string, any>) => {
        let query = `DELETE FROM ${table}`;
        const values: any[] = [];
        
        if (params?.where) {
          const whereConditions = Object.entries(params.where).map(([key, value], index) => {
            values.push(value);
            return `${key} = $${index + 1}`;
          }).filter(Boolean);
          
          if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
          }
        }
        
        query += ' RETURNING *';
        
        if (debug) console.log('[DB] DeleteMany query:', query, values);
        
        const result = await db.query(query, values);
        
        // Decrypt text fields if needed
        if (shouldEncrypt && textFields.length > 0) {
          return Promise.all(result.rows.map(async (row) => {
            const decryptedRow = { ...row } as Record<string, any>;
            for (const field of textFields) {
              if (decryptedRow[field] && typeof decryptedRow[field] === 'string') {
                try {
                  decryptedRow[field] = await decryptValue(decryptedRow[field]);
                } catch(e) {
                  decryptedRow[field] = '[DECRYPTION FAILED]';
                }
              }
            }
            return decryptedRow;
          }));
        }
        
        return result.rows;
      },
    };
  }

  return operations as DBOperations<ParseSchema<SQL>>;
}