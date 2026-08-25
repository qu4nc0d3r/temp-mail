import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App', () => {
  it('renders the brand name', () => {
    const wrapper = mount(App);
    expect(wrapper.text()).toContain('Temp Mail');
  });
});
