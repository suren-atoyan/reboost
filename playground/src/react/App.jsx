import * as React from 'react';

export const App = () => {
  const [count, setCount] = React.useState(0);

  console.log('Source map test');

  return (
    <div>
      <p>Count is {count}</p>
      {/* <p>New content</p> */}
      <button onClick={() => setCount(count + 10)}>Increase</button>
      <span style={{ width: 10, display: 'inline-block' }}></span>
      <button onClick={() => setCount(count - 10)}>Decrease</button>
    </div>
  )
}
