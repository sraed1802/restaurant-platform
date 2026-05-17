import { Capacitor, registerPlugin, WebPlugin } from '@capacitor/core'

export interface LaunchExternalAppPlugin {
  openPackage(options: { packageId: string }): Promise<void>
}

class LaunchExternalAppWeb extends WebPlugin implements LaunchExternalAppPlugin {
  async openPackage(): Promise<void> {
    throw new Error('LaunchExternalApp is only available in the native Android shell')
  }
}

const LaunchExternalApp = registerPlugin<LaunchExternalAppPlugin>('LaunchExternalApp', {
  web: () => new LaunchExternalAppWeb(),
})

export async function openAndroidPackageId(packageId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new Error('Not Android native')
  }
  await LaunchExternalApp.openPackage({ packageId })
}
