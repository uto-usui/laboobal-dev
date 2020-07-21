import * as Global from '../../store/global/type'

declare module 'vuex' {
  type RootState = {
    global: Global.S
  }
  type RootGetters = Global.RG
  type RootMutations = Global.RM
  type RootActions = Global.RA
}
