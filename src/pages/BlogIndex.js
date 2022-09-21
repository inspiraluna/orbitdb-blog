import React, { useEffect }  from "react"
import { Link as ReachLink  } from 'react-router-dom'
import { Link,HStack,Tag,TagLabel,TagCloseButton } from '@chakra-ui/react'
import { observer } from 'mobx-react'
import Moment from 'react-moment';
import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import CreatePost from "../components/CreatePost"
import ChakraUIRenderer from 'chakra-ui-markdown-renderer';
import ReactMarkdown from 'react-markdown'
import { CircularProgress } from '@chakra-ui/react'

const BlogIndex = (props) => {
  
  useEffect(() => { props.store.currentPost = undefined}, []);

  if(props.match.params.hash!==undefined){

      let dbName = props.match.params.hash;
      if(props.match.params.name!==undefined)
        dbName = dbName + '/' + props.match.params.name

      console.log('received dbName from url',dbName)
      props.store.setDbName = dbName
  }
 
  if (props.store.posts.length === 0) {
    return (
      <Layout location={props.location} store={props.store} title={process.env.TITLE}>
        <Seo title={process.env.TITLE} />
          {props.store.isOnline?'No blog posts found.':<CircularProgress isIndeterminate  />} 
        <Bio />
        <CreatePost {...props} />
      </Layout>
    )
  }
  
  return (
    <Layout location={props.location} store={props.store} title={process.env.TITLE}>
      <Seo title={process.env.TITLE} />
      <ol style={{ listStyle: `none` }}>
        {
          props.store.posts.slice().sort((a,b) => {return new Date(b.createdAt) - new Date(a.createdAt);}).map((post,i) => {
          if(post.subject===undefined) return (<li key={"empty_"+i}>&nbsp;</li>) //for some reason elements stay undefined in stores array after deleting them
          const subject  = post.name || post.subject
          const slug = post.hash
          const postDate = post.createdAt?new Date(post.createdAt).toISOString():undefined
       
          return (
            <li key={slug}>
              <article
                className="post-list-item"
                itemScope
                itemType="http://schema.org/Article"
              >
                <header>
                  <h2>
                    <Link as={ReachLink}  to={`${post.address}`} itemProp="url">
                      <span itemProp="headline">{subject}</span>
                    </Link>
                  </h2>
                  <Moment fromNow ago>{postDate}</Moment> ago &nbsp;<Moment date={postDate} />
                </header>
                <section><ReactMarkdown  components={ChakraUIRenderer()} children={post.body} skipHtml />
                </section>
                <HStack spacing={4}>
                  {
                    post.tags?.map((tagName) => (
                      <Tag
                        size={"md"}
                        key={tagName}
                        borderRadius="full"
                        variant="solid"
                        colorScheme="red"
                      ><TagLabel>{tagName}</TagLabel>
                      </Tag>
                      ))
                  }
              </HStack>
              </article>
            </li>
          )
        })}
      </ol>
      <p>&nbsp;</p>
      <Bio />
      <CreatePost {...props} />
     
    </Layout>
  )
}

export default observer(BlogIndex) 