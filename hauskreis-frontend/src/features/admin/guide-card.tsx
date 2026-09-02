import { Card, SectionTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import Link from '@/components/ui/link';

/**
 * Der Weg zur Anleitung, die man seinem Hauskreis schickt.
 *
 * Steht ganz oben, weil sie in genau dem Moment gebraucht wird, in dem man
 * dieses Bild zum ersten Mal sieht: Der Hauskreis ist angelegt, die anderen
 * acht wissen noch nichts. Danach schaut man hier nie wieder hin — dann sind
 * die Karten darunter die Hauptsache.
 */
export function GuideCard() {
  return (
    <section>
      <SectionTitle>Für deine Gruppe</SectionTitle>
      <Link href="/anleitung">
        <Card className="flex items-center gap-3 hover:border-line-strong">
          <FileText size={18} className="shrink-0 text-terracotta-500" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-800">
              Anleitung zum Weiterschicken
            </p>
            <p className="text-[11px] leading-relaxed text-stone-400">
              Die ersten Schritte auf einem Blatt — zum Ausdrucken oder als PDF
              speichern und in die Gruppe schicken.
            </p>
          </div>
        </Card>
      </Link>
    </section>
  );
}
