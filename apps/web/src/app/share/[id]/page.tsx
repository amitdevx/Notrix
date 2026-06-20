import React from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { parseMarkdown } from '@notrix/core-engine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabase = createClient(supabaseUrl, supabaseKey);

// Define type for Next.js 15 App Router dynamic parameters
export default async function SharedNotePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  
  // Try to fetch from Supabase
  let title = 'Published Note';
  let contentHtml = '<p>Note not found or Supabase is not configured.</p>';
  
  try {
    const { data } = await supabase
      .from('published_notes')
      .select('*')
      .eq('id', id)
      .single();
      
    if (data) {
      title = data.title;
      // We process markdown on the server for published pages
      contentHtml = await parseMarkdown(data.content);
    } else if (id === 'demo') {
      // Fallback demo note
      contentHtml = await parseMarkdown('# Welcome to Notrix Publish\n\nThis is a securely published note. It was rendered statically on the edge.');
    }
  } catch (_) {
    if (id === 'demo') {
      contentHtml = await parseMarkdown('# Welcome to Notrix Publish\n\nThis is a securely published note. It was rendered statically on the edge.');
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] text-neutral-200 font-sans selection:bg-blue-500/30">
      <header className="border-b border-neutral-800 bg-[#1e1e1e]/80 backdrop-blur-md sticky top-0 z-10 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center font-bold text-white text-xs">N</div>
            <span className="font-semibold tracking-wide text-white">Notrix Publish</span>
          </div>
          <Link href="/" className="text-sm text-neutral-400 hover:text-white transition-colors bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-full">Create your own</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <article 
          className="prose prose-invert prose-blue max-w-none prose-headings:font-semibold prose-a:text-blue-400"
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </main>

      <footer className="border-t border-neutral-800 py-8 text-center text-sm text-neutral-500">
        Published securely via Notrix
      </footer>
    </div>
  );
}
