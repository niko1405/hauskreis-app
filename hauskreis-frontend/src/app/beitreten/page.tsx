/**
 * `/beitreten#<code>` — wohin ein Einladungslink führt.
 *
 * Neben `app/(app)/` und nicht darin, wie `/auth/callback` und
 * `/datenschutz`: Dort sitzt `AuthGate`, und wer diesen Link öffnet, hat oft
 * noch gar kein Konto. Der Code steht hinter dem `#`, damit er weder beim
 * Webserver noch in einem `Referer` ankommt.
 */
import type { Metadata } from 'next';
import { JoinScreen } from '@/features/join/join-screen';

export const metadata: Metadata = {
  title: 'Einladung · Acts2',
};

export default function BeitretenPage() {
  return <JoinScreen />;
}
