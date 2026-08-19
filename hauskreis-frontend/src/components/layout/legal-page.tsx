/**
 * Die Hülle für Datenschutzerklärung und Impressum.
 *
 * Beide Seiten liegen **außerhalb** von `app/(app)/`, und das ist der Punkt:
 * Dort sitzt `AuthGate`, und eine Datenschutzerklärung, die man erst nach dem
 * Anmelden lesen kann, ist keine. Sie haben deshalb auch weder Navigation noch
 * Kopfbild — man kommt hierher, liest, und geht zurück.
 *
 * Kein `'use client'`: Die aufrufenden Seiten lesen ihre Markdown-Datei zur
 * Bauzeit vom Dateisystem, und das geht nur in einer Server-Komponente.
 */
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Prose } from '@/components/ui/prose';

export function LegalPage({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 pt-safe-6 pb-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-terracotta-600"
      >
        <ArrowLeft size={14} />
        Zur App
      </Link>

      <h1 className="mt-4 mb-6 font-serif text-3xl leading-tight font-bold text-stone-900">
        {title}
      </h1>

      <Prose markdown={markdown} />
    </main>
  );
}
