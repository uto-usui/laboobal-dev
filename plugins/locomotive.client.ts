import locomotiveScroll from 'locomotive-scroll'

export default (context, inject) => {
  context.$locomotiveScroll = locomotiveScroll
  inject('locomotiveScroll', locomotiveScroll)
}
