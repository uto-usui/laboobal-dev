import { GetterTree, MutationTree, ActionTree } from 'vuex'
import { S } from './type'

/**
 * state
 */
export const state = (): S => ({
  todos: [
    {
      id: 'a',
    },
    {
      id: 'b',
    },
    {
      id: 'c',
    },
  ],
})

/**
 * getters
 */
export const getters: GetterTree<S, S> = {
  todosCount(state, _getters, _rootState, _rootgetters) {
    return state.todos.length
  },
  getTodos(state) {
    return state.todos
  },
}

/**
 * mutations
 */
export const mutations: MutationTree<S> = {
  addTodo(state, payload) {
    state.todos.push(payload.todo)
  },
}
// ______________________________________________________
//
export const actions: ActionTree<S, S> = {
  asyncAddTodo({ commit }, payload) {
    commit('addTodo', payload)
  },
}
