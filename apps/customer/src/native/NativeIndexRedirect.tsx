import { Navigate } from 'react-router-dom'
import { NATIVE_WELCOME_SESSION_KEY } from '../lib/nativeWelcomeGate'

/** First open: language + login entry; later opens go straight to menu. */
export default function NativeIndexRedirect() {
  let done = false
  try {
    done = sessionStorage.getItem(NATIVE_WELCOME_SESSION_KEY) === '1'
  } catch {
    done = false
  }
  return <Navigate to={done ? '/menu' : '/welcome'} replace />
}
