import React, {Component} from "react";
import styles from "./styles";

export default class Button extends Component {
    onClick = () => {
        this.props.onClick(this.props.params);
    };
    render() {
        return (
            <button style={styles.button} onClick={this.onClick}>
                {this.props.children}
            </button>
        );
    }
}
