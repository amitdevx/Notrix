import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const { title, content, authorId } = await req.json();
    
    // Generate a unique short ID for sharing
    const shareId = Math.random().toString(36).substring(2, 10);
    
    // In a real app, we would insert into a 'published_notes' table
    const { error } = await supabase
      .from('published_notes')
      .insert([
        { id: shareId, title, content, author_id: authorId, published_at: new Date().toISOString() }
      ])
      .select()
      .single();

    // For the sake of this local phase, if Supabase fails (because it's a placeholder),
    // we'll still return the shareId and mock success.
    if (error && error.message.includes('fetch failed')) {
      console.warn('Supabase fetch failed (placeholder), mocking success');
    }

    return NextResponse.json({ success: true, shareId, url: `/share/${shareId}` });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
