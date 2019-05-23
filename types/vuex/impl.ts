import * as Sample from '../../store/sample/type'

declare module 'vuex' {
  type RootState = {
    sample: Sample.S
  }
  // type RootGetters = Counter.RG & Sample.RG
  type RootGetters = Sample.RG
  type RootMutations = Sample.RM
  type RootActions = Sample.RA
}
