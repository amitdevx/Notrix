import React, { useEffect, useState } from 'react';
import yaml from 'js-yaml';
import { DBClient, OPFSClient } from '@notrix/core-engine';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

interface BaseViewProps {
  path: string;
  opfs: OPFSClient;
}

interface BaseConfig {
  views?: Record<string, unknown>[];
  properties?: Record<string, { displayName?: string }>;
  filters?: Record<string, unknown>;
}

export function BaseView({ path, opfs }: BaseViewProps) {
  const [config, setConfig] = useState<BaseConfig | null>(null);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBase() {
      try {
        const content = await opfs.readFile(path);
        const parsed = yaml.load(content) as Record<string, unknown>;
        setConfig(parsed);
        
        let query = `
          SELECT f.path, f.title, f.created_at, f.updated_at 
          FROM files f
        `;
        
        const conditions: string[] = [];
        const filters = parsed?.filters as Record<string, string[]>;
        
        if (filters?.and) {
          for (const f of filters.and) {
            if (f.includes('hasTag')) {
              const match = f.match(/hasTag\("([^"]+)"\)/);
              if (match) {
                query += ` JOIN tags t ON f.path = t.file_path AND t.tag = '${match[1]}'`;
              }
            } else if (f.includes('inFolder')) {
              const match = f.match(/inFolder\("([^"]+)"\)/);
              if (match) {
                conditions.push(`f.folder LIKE '${match[1]}%'`);
              }
            }
          }
        }
        
        if (conditions.length > 0) {
          query += ` WHERE ` + conditions.join(' AND ');
        }
        
        const db = DBClient.getInstance();
        const results = await db.exec(query);
        
        const finalData = [];
        for (const row of results) {
          const props = await db.exec(`SELECT key, value FROM properties WHERE file_path = ?`, [row.path]);
          const propsObj: Record<string, unknown> = {};
          for (const p of props) {
            try { propsObj[p.key] = JSON.parse(p.value); } catch { propsObj[p.key] = p.value; }
          }
          finalData.push({ ...row, ...propsObj });
        }
        
        setData(finalData);
        
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    
    loadBase();
  }, [path, opfs]);

  const view = config?.views?.[0]; // Default to first view
  const columnHelper = createColumnHelper<Record<string, unknown>>();
  
  const columns = React.useMemo(() => {
    if (!view || !config) return [];
    const order = view.order as string[] | undefined;
    return order?.map((col: string) => {
      let header = col;
      if (col.startsWith('file.')) header = col.replace('file.', '');
      if (config.properties?.[col]?.displayName) header = config.properties[col].displayName;
      
      return columnHelper.accessor(col.replace('file.', ''), {
        header,
        cell: info => info.getValue() as React.ReactNode
      });
    }) || [];
  }, [view, config, columnHelper]);

  const table = useReactTable({
    data: data as Record<string, unknown>[],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (error) return <div className="p-4 text-red-500">Error loading base: {error}</div>;
  if (!config) return <div className="p-4">Loading base...</div>;
  if (!view) return <div className="p-4 text-gray-500">No views defined in base</div>;

  return (
    <div className="p-8 h-full overflow-auto bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <h1 className="text-3xl font-bold mb-6">{String(view.name || 'Untitled Base')}</h1>
      
      {String(view.type) === 'table' && (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="p-3 font-semibold text-sm">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="p-3 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {String(view.type) === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((row, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
              <h3 className="font-bold mb-2">{String(row.title || row.name || row.path)}</h3>
              {(view.order as string[])?.map((col: string) => {
                if (col === 'file.name' || col === 'file.title') return null;
                const val = row[col.replace('file.', '')];
                if (!val) return null;
                const label = config.properties?.[col]?.displayName || col;
                return <div key={col} className="text-sm"><span className="text-gray-500 mr-2">{label}:</span>{String(val)}</div>;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
