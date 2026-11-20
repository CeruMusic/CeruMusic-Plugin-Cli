export type * from './view-contracts.js'

export interface ViewDeps {
  vue: typeof import('vue')
  tdesign: typeof import('tdesign-vue-next')
  sdk: typeof import('./vue/index.js')
}
