import ReactTestRenderer, { ReactTestInstance } from 'react-test-renderer';
import App from '../App';

const text = (root: ReactTestInstance, id: string): string => {
  const node = root.findByProps({ testID: id });
  return [node.props.children].flat().join('');
};

async function render() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    r = ReactTestRenderer.create(<App />);
  });
  return r;
}

const press = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  ReactTestRenderer.act(() => {
    r.root.findByProps({ testID: id }).props.onPress();
  });

describe('Home screen', () => {
  it('starts with empty stock', async () => {
    const r = await render();
    expect(text(r.root, 'stock-qty')).toBe('0 g');
  });

  it('stock in then issue updates quantity and value', async () => {
    const r = await render();
    await press(r, 'btn-stock-in');
    expect(text(r.root, 'stock-qty')).toBe('1000 g');
    expect(text(r.root, 'stock-value')).toBe('Value Rs 120.00');
    await press(r, 'btn-issue');
    expect(text(r.root, 'stock-qty')).toBe('750 g');
  });

  it('shows an error instead of going negative', async () => {
    const r = await render();
    await press(r, 'btn-issue');
    expect(text(r.root, 'stock-qty')).toBe('0 g');
    expect(text(r.root, 'stock-error')).toContain('Insufficient stock');
  });
});
