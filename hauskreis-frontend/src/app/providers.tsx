'use client';

/**
 * Der Provider-Baum. Reihenfolge ist hier keine Geschmacksfrage:
 *
 *   AuthProvider     — hält die OIDC-Sitzung
 *   QueryClient      — der Cache, auf den die Brücke unten zugreift
 *   AuthBridge       — reicht das Token an den Fetch-Wrapper weiter und
 *                      lädt nach einer Token-Erneuerung alles nach; braucht
 *                      dafür den QueryClient, liegt also darunter
 *   HauskreisProvider— fragt selbst die Hauskreis-Liste ab, also darunter
 *   ToastProvider    — nur Anzeige, kommt zuletzt
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from 'react-oidc-context';
import { ToastProvider } from '@/components/ui/toast';
import { createQueryClient } from '@/lib/api/query-client';
import { AuthBridge } from '@/lib/auth/auth-bridge';
import { clearSigninParams, getUserManager } from '@/lib/auth/oidc-config';
import { HauskreisProvider } from '@/lib/hauskreis/hauskreis-context';

export function Providers({ children }: { children: React.ReactNode }) {
  // Darf bei jedem Rendern nicht neu entstehen, sonst ist der Cache weg.
  const [queryClient] = useState(createQueryClient);

  return (
    <AuthProvider
      userManager={getUserManager()}
      // Modulfunktion, keine Pfeilfunktion: der Provider hat sie in der
      // Abhängigkeitsliste seines Init-Effekts.
      onSigninCallback={clearSigninParams}
    >
      <QueryClientProvider client={queryClient}>
        <AuthBridge>
          <HauskreisProvider>
            <ToastProvider>{children}</ToastProvider>
          </HauskreisProvider>
        </AuthBridge>
      </QueryClientProvider>
    </AuthProvider>
  );
}
