import { Table } from "react-bootstrap";
import { useSelector, useDispatch } from "react-redux";
import { changeName, increase } from "./../store";

function Cart() {
  let state = useSelector((state) => state);
  let dispatch = useDispatch();

  return (
    <div>
      {state.user.name}의 장바구니
      <button
        onClick={() => {
          dispatch(increase(100));
        }}
      >
        {state.user.age}
      </button>
      <Table>
        <thead>
          <tr>
            <th>#</th>
            <th>상품명</th>
            <th>수량</th>
            <th>변경하기</th>
          </tr>
        </thead>
        <tbody>
          {state.cart.map((a, i) => (
            <tr key={i}>
              <td>{i}</td>
              <td>{state.cart[i].name}</td>
              <td>{state.cart[i].count}</td>
              <td>
                <button
                  onClick={() => {
                    dispatch(changeName());
                  }}
                >
                  +
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default Cart;
