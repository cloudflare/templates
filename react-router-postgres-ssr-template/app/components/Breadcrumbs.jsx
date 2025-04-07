import { Link } from "react-router";

function Breadcrumbs({ items, onNavigate }) {
  return (
    <nav className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        // Determine the appropriate link based on the item value
        let linkTo = "/";
        if (item.value && item.value !== "book") {
          linkTo = `/genre/${encodeURIComponent(item.value)}`;
        } else if (item.value === "book") {
          linkTo = null; // Current book page, no link
        }

        return (
          <div key={index} className="breadcrumb-item">
            {isLast ? (
              <span className="breadcrumb-current">{item.label}</span>
            ) : (
              <>
                {linkTo ? (
                  <Link to={linkTo} className="breadcrumb-link">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className="breadcrumb-link"
                    onClick={() => onNavigate && onNavigate(item.value)}
                  >
                    {item.label}
                  </span>
                )}
                <span className="breadcrumb-separator">&gt;</span>
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default Breadcrumbs;
